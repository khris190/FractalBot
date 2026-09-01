# Fractal bot

A Discord bot made for a single server, for fun. It answers pings with attitude, grants (or denies) wishes, occasionally roasts random messages, and can talk through a local LLM persona ("Chucha").

![BotAvatar](https://cdn.discordapp.com/avatars/1348328693428260906/826fbbc3cfa84d69c17354781b81c495.webp?size=512)

<!--toc:start-->
- [Fractal bot](#fractal-bot)
  - [Architecture](#architecture)
    - [Response handlers](#response-handlers)
    - [Slash commands](#slash-commands)
    - [Intervals](#intervals)
    - [Similarity service (Python)](#similarity-service-python)
    - [LLM integration](#llm-integration)
  - [Data & storage](#data--storage)
  - [Configuration](#configuration)
  - [Running](#running)
<!--toc:end-->

## Architecture

TypeScript (Node 22, discord.js v14), run via `ts-node`. Entry point is `index.ts` → `src/Client.ts`, which wires up events, commands and intervals.

### Response handlers

On every message, a chain of handlers runs in order; the first one that claims the message wins (`src/responses/*ResponseHandler.ts`):

| Handler | Trigger | Behavior |
| --- | --- | --- |
| `PingEveryoneResponseHandler` | someone uses @everyone/@here | replies with a "fucker" variant |
| `GrokResponseHandler` | message starts with `@grok` | "Not what I'm called." |
| `PingWishResponseHandler` | mentions bot + content starts with "i wish" | grants/denies the wish (4.8h cooldown per guild, stored in DB); uses the similarity service to reject repeated wishes ("Get more creative") |
| `LLMPingResponseHandler` | mentions bot (non-question) | asks the local LLM persona for a reply; 1min cooldown, admins bypass |
| `PingQuestionResponseHandler` | mentions bot + message contains "?" | random snarky answer from a weighted pool |
| `SpecyficResponseHandler` | exact-match phrases (currently: "w") | canned response |
| `RandomResponseHandler` | 0.1% chance on any message | random nonsense from a large weighted pool |

Shared plumbing:
- `BaseResponseHandler` — abstract base, `_handle()` returns truthy to claim the message.
- `ReplyHelper` — reply/send with optional artificial delay + typing indicator (delay scales with message length).
- `MessageArr` / `WeightedMessage` — weighted random message pools supporting nesting and decay multipliers.

### Slash commands

Auto-discovered from `src/commands/*Command.ts` at startup and registered via REST. Base classes:
- `BaseChatCommand` — guild check (leaves unknown guilds).
- `AdminChatCommand` — additionally checks `settings.ADMINS`.

Current commands:
- `/ping` — test command.
- `/catdeploymentmode` — toggle current channel in the image whitelist DB table.
- `/imdebug` — send the surprise image to the current channel now.
- `/arbitrarytenets <policy_definition_set>` — make the bot say something as if it were a normal message.
- `/remember` (admin) — compress all short-term conversations into long-term memory.txt via LLM, then clear them. Slow; shows "Compressing memory..." while running.

### Intervals

Registered in `Client.createIntervals()`:
- `RandomImage` — every second, with p=0.0000001 sends `data/images/suprise.jpg` to a random whitelisted channel (from the `imageChannel` DB table).

### Similarity service (Python)

`python/server.py` — tiny HTTP server on port 5000 using `sentence-transformers` (all-MiniLM-L6-v2, dot product). Given a sentence it returns max similarity against a store of previously seen wishes; if below threshold the sentence is added to the store. Used by `SimilarityChecker` (`src/utils/SimilarityChecker.ts`) for wish deduplication.

### LLM integration

`Model` (`src/utils/AI/Model.ts`) talks to a llama.cpp-style `/completion` endpoint (env `LLM_ENDPOINT`, default `localhost:8080`). Persona prompt lives in `data/LLM/prompt.txt`. Single-flight via a `busy` flag.

Chucha has two memory layers:
- **Short-term** — per-conversation turns in SQLite (`conversationTurn` table, keyed by Discord message id). Each reply-chain is one thread; the whole thread is sent as context on every response. Stored once per message (no duplication).
- **Long-term** — `data/LLM/memory.txt`, loaded into the prompt on every call. Populated via `/remember` (admin command), which uses the LLM to distill all short-term conversations into concise notes, appends them to memory.txt, then clears the short-term DB.

If memory.txt exceeds 10KB it is auto-compressed by the LLM before appending (atomic swap: write `memoryTMP.txt`, rename over). `history.txt` remains a raw audit log of input/output pairs — never read back.

## Data & storage

- SQLite (`better-sqlite3` + drizzle-orm), file at `$DATA_PATH/$DB_FILE` (default `./data/db.sqlite`).
- Schema in `src/utils/db/schema.ts`, migrations run with `npx drizzle-kit migrate`.
  - `imageChannel` — channels eligible for the random image interval.
  - `messageBlacklistChannel` — defined but currently unused by code.
  - `guildData` — per-guild state (last wish timestamp).
  - `conversationTurn` — Chucha's short-term memory: one row per message in a reply-chain thread (`threadId` = root message id, unique `messageId`, role, content).

## Configuration

Environment variables (via `.env`, see `src/utils/env.ts`):

| Variable | Default | Description |
| --- | --- | --- |
| `TOKEN` | — | Discord bot token (required) |
| `CLIENT_ID` | — | Application ID for command registration |
| `GUILD_ID` | — | The one allowed guild; other guilds are left automatically |
| `DATA_PATH` | `./data` | Data directory (images, LLM files, DB) |
| `LOG_PATH` | `./logs` | Log directory |
| `DB_FILE` | `db.sqlite` | SQLite filename inside DATA_PATH |
| `SIMILARITY_ENDPOINT` | `localhost:5000` | Similarity service URL (docker-compose sets the internal one) |
| `SIMILARITY_THRESHOLD` | 0.9 | Above this a wish counts as duplicate (`SIMILARITY_TRESHOLD` still accepted) |
| `LLM_ENDPOINT` | `localhost:8080` | llama.cpp-style completion endpoint |

Admins are hardcoded in `src/settings.ts`.

## Requirements

- node 22
- docker + docker compose (for the similarity service)
- optionally: a local LLM server exposing `/completion`

## Running

``` bash
./bin/update.sh && ./bin/run.sh
```

This runs `git pull && npx drizzle-kit migrate`, then `docker compose up --build`. Compose starts two services: `fractal-bot` (node) and `fractal-similarity` (python). The LLM endpoint is expected on the host machine (`host.docker.internal:5555`).

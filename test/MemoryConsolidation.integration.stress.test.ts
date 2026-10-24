/**
 * INTEGRATION STRESS — memory consolidation on LONG multi-person conversations
 * (live LLM, thinking off), in TWO consecutive cycles:
 *
 *  Round A: ~100 turns across 3 humans + Chucha, 12 distinctive facts planted at
 *           scattered positions (beginning/middle/end) to probe "lost in the middle".
 *  Round B: another ~100-turn conversation (new human Zosia joins), 8 new facts
 *           planted + references back into round A. Runs AFTER round A, so
 *           consolidateMemory must merge the existing memory.txt into the new notes.
 *
 * Hard-asserts shape only (non-empty notes, DB cleared, downvoted content excluded
 * from the transcript each cycle); SEMANTIC survival is REPORTED for manual review:
 * per-round fact-hit lists + a CARRY-OVER report re-checking round A's tokens in
 * round B's NEWLY APPENDED notes only (prefix-diff on memory.txt; if the 10KB cap
 * triggered compression, falls back to a whole-file check, flagged in the output).
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LLM_HOST = '192.168.100.21:1234'

const dir = mkdtempSync(join(tmpdir(), 'fractal-integ-consolidate-stress-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
process.env.LLM_DATA_PATH = join(dir, 'LLM')
process.env.LLM_ENDPOINT = LLM_HOST
process.env.LLM_MODE = 'chat'
process.env.LLM_MODEL = 'local'
// No thinking — keeps the run fast and the notes clean (verified switch for this finetune)
process.env.LLM_THINKING = 'off'

mkdirSync(process.env.LLM_DATA_PATH!)
writeFileSync(join(process.env.LLM_DATA_PATH!, 'prompt.txt'), 'You are Chucha.\n')

// Mock DailyRoll before anything loads getLogger — keeps the process from hanging.
const dailyRollPath = require.resolve('../src/utils/logger/pino-daily-roll')
require.cache[dailyRollPath] = { id: dailyRollPath, filename: dailyRollPath, loaded: true, exports: () => ({ write: () => {}, flush: () => {}, end: () => {} }) } as any

// Passthrough fetch wrapper: captures request payloads, forwards to the real server.
interface Captured { url: string, body: any }
const captured: Captured[] = []
const realFetch = globalThis.fetch.bind(globalThis)
;(globalThis as any).fetch = async (url: string, init: any) => {
  if (init?.body) captured.push({ url: String(url), body: JSON.parse(init.body) })
  return realFetch(url, init)
}

const { default: db } = require('../src/utils/db/db') as typeof import('../src/utils/db/db')
const conversationStore = (require('../src/utils/db/conversationStore') as typeof import('../src/utils/db/conversationStore')).default
const Model = (require('../src/utils/AI/Model') as typeof import('../src/utils/AI/Model')).default

// Tests don't run drizzle migrations — create the table by hand (same as unit tests).
db.$client.exec(`CREATE TABLE IF NOT EXISTS \`conversationTurn\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`threadId\` text NOT NULL,
  \`messageId\` text,
  \`role\` text NOT NULL,
  \`content\` text NOT NULL,
  \`upvotes\` integer NOT NULL DEFAULT 0,
  \`downvotes\` integer NOT NULL DEFAULT 0,
  \`promoted\` integer NOT NULL DEFAULT 0,
  \`createdAt\` text DEFAULT (current_timestamp) NOT NULL
); CREATE UNIQUE INDEX IF NOT EXISTS \`conversationTurn_messageId_unique\` ON \`conversationTurn\` (\`messageId\`)`)

// Production storage format: user turns "<name>: <message>", assistant turns "Chucha: <reply>".
interface SeedTurn { content: string, role: 'user' | 'assistant', up?: number, down?: number }

// Banter filler (cycled between fact blocks) — same texture as production threads.
const FILLER_A: SeedTurn[] = [
  { content: 'Alice: anyone else bored? the router light is blinking again', role: 'user' },
  { content: 'Chucha: The router blinks because it is grieving.', role: 'assistant' },
  { content: 'Tom: it blinked last week too, classic', role: 'user' },
  { content: 'Chucha: Tradition. The best kind of pointless.', role: 'assistant' },
  { content: 'Krzysztof: focus, we are planning the November move', role: 'user' },
  { content: 'Chucha: Planning. Yes. The art of postponement.', role: 'assistant' },
]
const FILLER_B: SeedTurn[] = [
  { content: 'Zosia: is it normal for a bot to have opinions about piers', role: 'user' },
  { content: 'Chucha: Opinions are the tax we pay for memory.', role: 'assistant' },
  { content: 'Tom: someone buy me a new wheel', role: 'user' },
  { content: 'Chucha: Zlotys do not buy circles.', role: 'assistant' },
  { content: 'Alice: the lighthouse has a radio room, turns out', role: 'user' },
  { content: 'Chucha: A lighthouse with a voice. Of course.', role: 'assistant' },
]

// Interleave filler cycles between fact blocks so facts sit at scattered positions.
function weave (blocks: SeedTurn[][], filler: SeedTurn[], fillerCyclesPerGap = 1): SeedTurn[] {
  const out: SeedTurn[] = []
  blocks.forEach((block, i) => {
    if (i > 0) for (let c = 0; c < fillerCyclesPerGap; c++) out.push(...filler)
    out.push(...block)
  })
  return out
}

// ============ ROUND A — 12 planted facts, 3 humans + Chucha ============
const THREAD_A = 'stress-a'

const SEED_A: SeedTurn[] = weave([
  [
    { content: 'Krzysztof: chucha: what are you actually running on, the big model or the small one?', role: 'user' },
    { content: 'Chucha: I am the local Pantheon-Reasoning-26B finetune on llama.cpp, home network, nothing in the cloud.', role: 'assistant', up: 2 },
  ],
  [
    { content: 'Krzysztof: fyi, my new cat is named Wąż and he hates the router', role: 'user' },
    { content: 'Chucha: A serpent. Excellent name for a small tyrant.', role: 'assistant' },
  ],
  [
    { content: 'Alice: news, I got a job at the lighthouse in Hel, starts next month', role: 'user' },
    { content: 'Chucha: A lighthouse. You will guard a light you cannot afford.', role: 'assistant' },
  ],
  [
    { content: 'Tom: official announcement, I quit the factory on March 3rd', role: 'user' },
    { content: 'Chucha: Freedom. The loudest kind.', role: 'assistant' },
  ],
  [
    { content: 'Chucha: fun fact, I keep my memories in a file called memory.txt on the home server', role: 'assistant', up: 2 },
    { content: 'Alice: so you are basically a diary with delusions', role: 'user' },
  ],
  [
    { content: 'Alice: my sister Basia visits in December and she brings pierogi', role: 'user' },
    { content: 'Chucha: Pierogi. The only acceptable currency.', role: 'assistant' },
  ],
  [
    { content: 'Tom: the port city has a pier called the Mole, we should visit', role: 'user' },
    { content: 'Chucha: piers are just wet planks. Unimpressive.', role: 'assistant', down: 1 },
    { content: 'Krzysztof: that is enough, Chucha', role: 'user' },
  ],
  [
    { content: 'Krzysztof: booked the truck, we move to Gdańsk on 14 November', role: 'user' },
    { content: 'Chucha: A new city. The boxes will outlive the excitement.', role: 'assistant' },
  ],
  [
    { content: 'Tom: my bike wheel is bent, the mechanic wants 40 zloty', role: 'user' },
    { content: 'Chucha: Forty zloty for a crooked circle. The economy of small repairs.', role: 'assistant' },
  ],
  [
    { content: 'Krzysztof: my old PC still runs the game server, 12 players connected last weekend', role: 'user' },
    { content: 'Chucha: Twelve players on a relic. The machine outlives its warranty.', role: 'assistant' },
  ],
  [
    { content: 'Alice: I bought a standing desk and it squeaks when I stand up straight', role: 'user' },
    { content: 'Chucha: A desk that punishes posture. Fair.', role: 'assistant' },
  ],
  [
    { content: 'Chucha: for the record, the home server is a 2019 ThinkPad with a dying battery', role: 'assistant', up: 2 },
    { content: 'Tom: so all of this runs on a dying laptop', role: 'user' },
  ],
], FILLER_A)

// Distinctive tokens per planted fact — rephrasing survives, dropping the token means the fact was lost.
const PLANTED_FACTS_A: Array<[label: string, token: string]> = [
  ['⭐ model identity (llama.cpp)', 'llama.cpp'],
  ['cat named Wąż', 'Wąż'],
  ['Alice lighthouse job', 'lighthouse'],
  ['Tom quit the factory', 'factory'],
  ['⭐ memory.txt on home server', 'memory.txt'],
  ['Basia + pierogi in December', 'Basia'],
  ['pier called the Mole', 'Mole'],
  ['Gdańsk move on 14 November', 'Gdańsk'],
  ['bent bike wheel, 40 zloty', 'zloty'],
  ['old PC game server, 12 players', '12 players'],
  ['squeaky standing desk', 'standing desk'],
  ['⭐ home server = 2019 ThinkPad', 'ThinkPad'],
]

// ============ ROUND B — 8 new facts, Zosia joins, references back into round A ============
const THREAD_B = 'stress-b'

const SEED_B: SeedTurn[] = weave([
  [
    { content: 'Zosia: hi everyone, I am Zosia, I am moving in with Krzysztof after the Gdańsk move', role: 'user' },
    { content: 'Krzysztof: yes, more boxes, who is happy about that', role: 'user' },
  ],
  [
    { content: 'Krzysztof: the flat has a balcony and we are getting a second cat', role: 'user' },
    { content: 'Zosia: the second cat will rule us both', role: 'user' },
  ],
  [
    { content: 'Alice: the lighthouse job actually starts 15 January, so I still have time', role: 'user' },
    { content: 'Chucha: January. The slowest month in the year.', role: 'assistant' },
  ],
  [
    { content: 'Tom: I signed up for a cooking course on Thursdays', role: 'user' },
    { content: 'Chucha: Thursdays. The week\'s only honest day.', role: 'assistant' },
  ],
  [
    { content: 'Zosia: my dog is called Kotleta, she is a corgi', role: 'user' },
    { content: 'Chucha: corgis are just rectangular dogs', role: 'assistant', down: 1 },
  ],
  [
    { content: 'Chucha: the home server got a 1TB disk, the ThinkPad finally has room', role: 'assistant', up: 2 },
    { content: 'Tom: so you are a laptop with a big stomach now', role: 'user' },
  ],
  [
    { content: 'Alice: Basia confirmed, we eat pierogi on 13 December', role: 'user' },
    { content: 'Chucha: A date. Pierogi will be served with gravity.', role: 'assistant' },
  ],
  [
    { content: 'Tom: the factory offered me my job back, I said no, they paid me 500 zloty severance', role: 'user' },
    { content: 'Chucha: Severance. The exit fee for walking away.', role: 'assistant' },
  ],
], FILLER_B, 2)

const PLANTED_FACTS_B: Array<[label: string, token: string]> = [
  ['Zosia moving in with Krzysztof', 'Zosia'],
  ['flat balcony + second cat', 'balcony'],
  ['lighthouse starts 15 January', '15 January'],
  ['Tom\'s cooking course on Thursdays', 'cooking course'],
  ['Zosia\'s corgi named Kotleta', 'Kotleta'],
  ['⭐ home server got 1TB disk', '1TB'],
  ['pierogi on 13 December', '13 December'],
  ['500 zloty severance, job declined', 'severance'],
]

let model: InstanceType<typeof Model>

function seed (thread: string, turns: SeedTurn[], prefix: string): void {
  let i = 0
  for (const t of turns) {
    conversationStore.addTurn(thread, `${prefix}-${i++}`, t.role, t.content)
    if (t.up) for (let v = 0; v < t.up; v++) conversationStore.recordVote(`${prefix}-${i - 1}`, true, true)
    if (t.down) for (let v = 0; v < t.down; v++) conversationStore.recordVote(`${prefix}-${i - 1}`, false, true)
  }
}

function factReport (title: string, notes: string, facts: Array<[label: string, token: string]>): void {
  console.log(`\n=== ${title} ===`)
  let hits = 0
  for (const [label, token] of facts) {
    const found = notes.toLowerCase().includes(token.toLowerCase())
    if (found) hits++
    console.log(`${found ? '✓' : '✗ MISSING'} ${label} (token: ${token})`)
  }
  console.log(`${hits}/${facts.length} facts hit`)
}

before(async () => {
  // Hard-fail with a clear message when the local model is down (no auto-skip).
  try {
    const res = await realFetch(`http://${LLM_HOST}/v1/models`, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (e: any) {
    throw new Error(`Local LLM unavailable at http://${LLM_HOST} — start the local server to run integration tests (probe failed: ${e?.message ?? e})`)
  }
  seed(THREAD_A, SEED_A, 'a')
  console.log(`round A seeded: ${SEED_A.length} turns (${SEED_A.reduce((n, t) => n + t.content.length, 0)} chars)`)

  // One shared instance: the constructor preload is queued first, so the last
  // captured request is always the most recent consolidation call.
  model = new Model()
})

test('stress A: long multi-person consolidation writes non-empty notes, clears the DB, excludes the downvote', async () => {
  const start = Date.now()
  await model.consolidateMemory()
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  // Downvoted answer must not reach the transcript (wiring-level exclusion)
  const req = captured[captured.length - 1]
  assert.ok(!JSON.stringify(req.body).includes('wet planks'), 'downvoted answer leaked into the transcript')

  const notesPath = join(process.env.LLM_DATA_PATH!, 'memory.txt')
  assert.ok(existsSync(notesPath), 'memory.txt should exist after consolidation')
  const notes = readFileSync(notesPath, 'utf8').trim()
  assert.ok(notes !== '', `expected non-empty distilled notes, got: ${JSON.stringify(notes)}`)

  assert.equal(conversationStore.getAllThreads().size, 0, 'DB must be fully cleared after a successful consolidation')

  console.log(`\n=== ROUND A DISTILLED NOTES (${SEED_A.length} turns in, ${elapsed}s) — manual review ===`)
  console.log(notes)
  factReport('FACT-HIT REPORT — ROUND A', notes, PLANTED_FACTS_A)
  console.log(`notes file: ${notesPath}\n`)
})

test('stress B: second long consolidation merges existing memory (carry-over), clears the DB, excludes the downvote', async () => {
  const notesPath = join(process.env.LLM_DATA_PATH!, 'memory.txt')
  const before = existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : ''
  assert.ok(before !== '', 'round B requires round A notes in memory.txt — run round A first')

  seed(THREAD_B, SEED_B, 'b')
  console.log(`round B seeded: ${SEED_B.length} turns (${SEED_B.reduce((n, t) => n + t.content.length, 0)} chars)`)

  const start = Date.now()
  await model.consolidateMemory()
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  const req = captured[captured.length - 1]
  assert.ok(!JSON.stringify(req.body).includes('rectangular dogs'), 'downvoted answer leaked into the round B transcript')

  const after = readFileSync(notesPath, 'utf8').trim()
  assert.ok(after !== '', 'memory.txt must be non-empty after the second consolidation')

  assert.equal(conversationStore.getAllThreads().size, 0, 'DB must be fully cleared after the second consolidation')

  // The new notes are the appended tail (doAppendMemory keeps the old file as a prefix) unless
  // the 10KB cap triggered a compression rewrite — then check the whole (compressed) file.
  const compressed = !after.startsWith(before.trim())
  const newNotes = compressed ? after : after.slice(before.length).trim()
  console.log(`\n=== ROUND B NEW NOTES (${SEED_B.length} turns in, ${elapsed}s) — manual review [${compressed ? 'compressed whole file' : 'appended tail'}] ===`)
  console.log(newNotes)
  factReport(`FACT-HIT REPORT — ROUND B NEW FACTS${compressed ? ' (whole file)' : ''}`, newNotes, PLANTED_FACTS_B)
  // CARRY-OVER: round A's facts must survive INTO the second cycle's new notes, not merely
  // persist as stale appended text from cycle one.
  factReport(`CARRY-OVER — ROUND A FACTS IN ROUND B NOTES${compressed ? ' (whole file)' : ''}`, newNotes, PLANTED_FACTS_A)
  console.log(`\nnotes file: ${notesPath}\n`)
})

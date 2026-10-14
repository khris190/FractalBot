/**
 * System 1 AI — microturn handoff test.
 *
 * Simulates a casual conversation (words + timestamps) arriving live.
 * MicroturnHandler parses the stream into speech microturns (1-2 words
 * within 300 ms) and growing silence: every 300 ms of a pause over 400 ms
 * is reported as it happens, with the cumulative duration so far.
 * After every event the small model decides, seeing recent history,
 * whether the bigger LLM should take the turn to reply.
 * Every decision latency is measured.
 */

// One spoken word with the moment it was said.
interface WordEvent {
  t: number; // ms since the conversation started
  word: string;
}

// What the handler emits and the decision LLM reacts to.
interface SpeechEvent {
  kind: "speech";
  index: number;
  t: number; // ms of the first word in the microturn
  words: string[];
}
interface SilenceEvent {
  kind: "silence";
  index: number;
  t: number; // ms of this silence tick
  duration: number; // cumulative ms of silence so far
}
type StreamEvent = SpeechEvent | SilenceEvent;

// A test conversation: what was said when + how long the user stays silent at the end.
interface Conversation {
  name: string;
  words: WordEvent[];
  trailingSilenceMs: number;
}

// The JSON decision the grammar forces the model to produce.
interface HandoffDecision {
  handoff: boolean;
}

// The decision plus the model's confidence in each boolean option.
interface HandoffResult {
  decision: HandoffDecision;
  confidence?: { truePct: number; falsePct: number };
}

// Standard OpenAI Chat Completions response shape.
interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    logprobs?: {
      content: Array<{
        token: string;
        logprob: number;
        top_logprobs: Array<{ token: string; logprob: number }>;
      }> | null;
    } | null;
  }>;
}

const SERVER_URL = "http://localhost:12345/v1/chat/completions";

// Forces exactly: {"handoff": true} or {"handoff": false}
const HANDOFF_GRAMMAR: string = String.raw`
root ::= "{" space "handoff" space ":" space boolean "}"
space  ::= " "?
boolean ::= "true" | "false"
`;

const SYSTEM_PROMPT =
  "You are a small fast model in a live conversation; a bigger AI is on standby to answer. " +
  "Decide whether the bigger AI should take the turn on what was just said. " +
  "Take the turn (true) only if they finished a complete thought or question and then went silent. " +
  "Hold (false) if they are still talking or the thought is incomplete.";

const HISTORY_WINDOW = 8; // how many recent events the decision LLM sees (incl. the latest)

// ---------------------------------------------------------------------------
// Test data: casual conversations, realistic speech timing.
// Words land 200-350 ms apart within a phrase; people pause 700-1000 ms
// between thoughts (sometimes mid-sentence) and stop for 1.5-2.5 s at the end.
// ---------------------------------------------------------------------------

const CONVERSATIONS: Conversation[] = [
  {
    name: "casual chat, ends on a statement",
    trailingSilenceMs: 2000,
    words: [
      { t: 0, word: "hey" },
      { t: 250, word: "so" },
      { t: 800, word: "what" },
      { t: 1050, word: "are" },
      { t: 1300, word: "you" },
      { t: 1550, word: "up" },
      { t: 2350, word: "to" },
      { t: 2600, word: "lately" },
      { t: 2900, word: "anyway" },
      { t: 3700, word: "just" },
      { t: 4000, word: "watching" },
      { t: 4300, word: "some" },
      { t: 4600, word: "old" },
      { t: 4900, word: "movies" },
    ],
  },
  {
    name: "direct question, waits for an answer",
    trailingSilenceMs: 2500,
    words: [
      { t: 0, word: "quick" },
      { t: 250, word: "question" },
      { t: 1100, word: "do" },
      { t: 1350, word: "you" },
      { t: 1600, word: "think" },
      { t: 1850, word: "it" },
      { t: 2150, word: "ll" },
      { t: 2400, word: "rain" },
      { t: 2700, word: "tomorrow" },
    ],
  },
  {
    name: "rambling with mid-sentence pauses",
    trailingSilenceMs: 1800,
    words: [
      { t: 0, word: "um" },
      { t: 300, word: "so" },
      { t: 1300, word: "i" },
      { t: 1550, word: "was" },
      { t: 1800, word: "thinking" },
      { t: 2800, word: "maybe" },
      { t: 3100, word: "we" },
      { t: 3400, word: "should" },
      { t: 3700, word: "go" },
      { t: 4600, word: "the" },
      { t: 4900, word: "one" },
      { t: 5200, word: "by" },
      { t: 5450, word: "the" },
      { t: 5700, word: "river" },
    ],
  },
];

// ---------------------------------------------------------------------------
// MicroturnHandler: word stream -> speech microturns + silence events
// ---------------------------------------------------------------------------

class MicroturnHandler {
  private static readonly SPEECH_WINDOW_MS = 300; // one microturn spans at most this
  private static readonly SILENCE_THRESHOLD_MS = 400; // a longer gap is a silence event
  private static readonly MAX_WORDS_PER_MICROTURN = 2;

  private events: StreamEvent[] = [];
  private buffer: WordEvent[] = [];
  private lastT: number | undefined;

  // Feed one spoken word; returns the events it produced (0-2).
  feed(word: WordEvent): StreamEvent[] {
    const produced: StreamEvent[] = [];

    if (this.lastT !== undefined) {
      const gap = word.t - this.lastT;
      if (gap > MicroturnHandler.SILENCE_THRESHOLD_MS) {
        // The user stopped: close the open microturn, then report the
        // growing silence in 300 ms steps, as it happens.
        const flushed = this.flushBuffer();
        if (flushed) produced.push(flushed);
        for (
          let d = MicroturnHandler.SPEECH_WINDOW_MS;
          d <= gap;
          d += MicroturnHandler.SPEECH_WINDOW_MS
        ) {
          produced.push(
            this.emit({ kind: "silence", t: this.lastT + d, duration: d }),
          );
        }
      } else if (
        this.buffer.length > 0 &&
        gap > MicroturnHandler.SPEECH_WINDOW_MS
      ) {
        // New phrase, too quick to count as silence: close the microturn.
        const flushed = this.flushBuffer();
        if (flushed) produced.push(flushed);
      }
    }

    this.buffer.push(word);
    this.lastT = word.t;

    if (this.buffer.length >= MicroturnHandler.MAX_WORDS_PER_MICROTURN) {
      const flushed = this.flushBuffer();
      if (flushed) produced.push(flushed);
    }

    return produced;
  }

  // End of the stream: close the open microturn + the trailing silence.
  finish(trailingSilenceMs: number): StreamEvent[] {
    const produced: StreamEvent[] = [];
    const flushed = this.flushBuffer();
    if (flushed) produced.push(flushed);
    const start = this.lastT ?? 0;
    for (
      let d = MicroturnHandler.SPEECH_WINDOW_MS;
      d <= trailingSilenceMs;
      d += MicroturnHandler.SPEECH_WINDOW_MS
    ) {
      produced.push(this.emit({ kind: "silence", t: start + d, duration: d }));
    }
    // The stream ends in silence: report the exact final duration too.
    if (trailingSilenceMs % MicroturnHandler.SPEECH_WINDOW_MS !== 0) {
      produced.push(
        this.emit({
          kind: "silence",
          t: start + trailingSilenceMs,
          duration: trailingSilenceMs,
        }),
      );
    }
    return produced;
  }

  private flushBuffer(): StreamEvent | undefined {
    if (this.buffer.length === 0) return undefined;
    const words = this.buffer.map((w) => w.word);
    const t = this.buffer[0].t;
    this.buffer = [];
    return this.emit({ kind: "speech", t, words });
  }

  private emit(
    event: Omit<SpeechEvent, "index"> | Omit<SilenceEvent, "index">,
  ): StreamEvent {
    const full = { ...event, index: this.events.length } as StreamEvent;
    this.events.push(full);
    return full;
  }
}

// ---------------------------------------------------------------------------
// Decision prompt + model call
// ---------------------------------------------------------------------------

function formatEvent(event: StreamEvent): string {
  return event.kind === "speech"
    ? `"${event.words.join(" ")}"`
    : `[pause ${event.duration}ms]`;
}

// Flat list of the recent events (including the latest one) + the question.
// Consecutive silence ticks collapse into one entry: an ongoing pause is a
// single evolving number, so only the latest duration is shown.
function promptForEvent(events: StreamEvent[], latestIndex: number): string {
  const window = events.slice(
    Math.max(0, latestIndex + 1 - HISTORY_WINDOW),
    latestIndex + 1,
  );
  const rendered: string[] = [];
  let prev: StreamEvent | undefined;
  for (const event of window) {
    if (event.kind === "silence" && prev?.kind === "silence") {
      rendered[rendered.length - 1] = formatEvent(event); // grow, don't append
    } else {
      rendered.push(formatEvent(event));
    }
    prev = event;
  }
  return `${rendered.join(" ")} handoff?`;
}

function logprobToPercentage(logprob: number): number {
  return Math.round(Math.exp(logprob) * 100);
}

async function decideHandoff(prompt: string): Promise<HandoffResult> {
  const payload = {
    model: "system1-model",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.0, // Maximum determinism
    max_tokens: 20, // The grammar caps the answer anyway
    reasoning_effort: "none", // System 1: no thinking phase
    grammar: HANDOFF_GRAMMAR, // Enforce the rigid JSON shape at the token level
    logprobs: true, // return per-token log probabilities
    top_logprobs: 2, // top-2 alternatives per position (here: true / false)
  };

  const response = await fetch(SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Server error: ${response.status} ${response.statusText} — ${await response.text()}`,
    );
  }

  const data: ChatCompletionResponse = await response.json();

  // Thanks to the grammar this should be clean JSON. If the server ignored
  // the grammar, the model may return bare keys ({handoff: false}) — quote them.
  const rawOutput = data.choices[0].message.content.trim();
  const strictJson = rawOutput.replace(
    /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    '$1"$2":',
  );
  const decision = JSON.parse(strictJson) as HandoffDecision;

  // Confidence: at the position that emitted "true"/"false" the grammar
  // allows exactly those two tokens, so top-2 logprobs cover both options.
  let confidence: { truePct: number; falsePct: number } | undefined;
  const valueToken = (data.choices[0].logprobs?.content ?? []).find(
    (t) => t.token.trim() === "true" || t.token.trim() === "false",
  );
  if (valueToken) {
    const chosen = valueToken.token.trim();
    const other = chosen === "true" ? "false" : "true";
    const otherLogprob = valueToken.top_logprobs?.find(
      (t) => t.token.trim() === other,
    )?.logprob;
    const chosenPct = logprobToPercentage(valueToken.logprob);
    const otherPct =
      otherLogprob !== undefined ? logprobToPercentage(otherLogprob) : 0;
    confidence =
      chosen === "true"
        ? { truePct: chosenPct, falsePct: otherPct }
        : { truePct: otherPct, falsePct: chosenPct };
  }

  return { decision, confidence };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runConversation(
  conv: Conversation,
  allLatencies: number[],
): Promise<void> {
  console.log(`\n=== ${conv.name} (${conv.words.length} words) ===`);

  const handler = new MicroturnHandler();
  const events: StreamEvent[] = [];
  let firstHandoff: StreamEvent | undefined;

  const consider = async (event: StreamEvent) => {
    const idx = events.length;
    events.push(event);

    const prompt = promptForEvent(events, idx);
    const start = performance.now();
    const { decision, confidence } = await decideHandoff(prompt);
    const latencyMs = performance.now() - start;
    allLatencies.push(latencyMs);

    if (decision.handoff && !firstHandoff) firstHandoff = event;

    const conf = confidence
      ? `  conf: true ${confidence.truePct}% | false ${confidence.falsePct}%`
      : "";
    console.log(
      `  ev ${String(idx).padStart(2)}  t=${String(event.t).padStart(5)}ms  ` +
        `${formatEvent(event).padEnd(22)} -> ${decision.handoff ? "HANDOFF" : "-"}  ` +
        `(${latencyMs.toFixed(0)} ms)${conf}\n` +
        `    sent: ${prompt}`,
    );
  };

  for (const word of conv.words) {
    for (const event of handler.feed(word)) {
      await consider(event);
    }
  }
  for (const event of handler.finish(conv.trailingSilenceMs)) {
    await consider(event);
  }

  console.log(
    firstHandoff
      ? `  first handoff: ${formatEvent(firstHandoff)} at t=${firstHandoff.t}ms`
      : "  no handoff: the bigger AI never took the turn",
  );
}

async function main(): Promise<void> {
  console.log(`System prompt: ${SYSTEM_PROMPT}`);
  console.log(
    `Output grammar: ${HANDOFF_GRAMMAR.trim().replace(/\s*\n\s*/g, " / ")}`,
  );
  const allLatencies: number[] = [];

  for (const conv of CONVERSATIONS) {
    await runConversation(conv, allLatencies);
  }

  const min = Math.min(...allLatencies);
  const max = Math.max(...allLatencies);
  const avg =
    allLatencies.reduce((sum, l) => sum + l, 0) / allLatencies.length;

  console.log("");
  console.log(
    `Decision latency: min ${min.toFixed(0)} ms / avg ${avg.toFixed(0)} ms / max ${max.toFixed(0)} ms over ${allLatencies.length} decisions`,
  );
}

main().catch((error: unknown) => {
  console.error("[FAIL]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import type { Conversation, StreamEvent } from './types'
import { MicroturnHandler } from './handler'
import { promptForEvent, formatEvent } from './prompts'
import { decideHandoff } from './api'

// ============================================================================
// Named prompts
// ============================================================================

/**
 * Each prompt is a system-level instruction sent to the decision LLM.
 *
 * Input format the LLM sees (via the `instructions` field):
 *   "<event> [pause <N>ms] <event> handoff?"
 * where <event> is a quoted speech turn like "hey so" or a silence tick [pause 300ms].
 *
 * The LLM must output a probability for `handoff = true` via the /v1/systemone protocol.
 *
 * We embed examples, context about the input format, and clear decision criteria
 * so the model reasons correctly even from minimal signal.
 */
export const PROMPTS = [
  {
    name: 'balanced',
    text:
     'You are a conversational turn-taking assistant. A smaller, faster AI model is in the conversation right now, ' +
     'but a bigger, more capable AI can take over when the moment is right.\n\n' +
     'YOUR JOB: Decide if the bigger AI should take the turn (true) or wait (false).\n\n' +
     'INPUT FORMAT: You see a sequence of speech turns and silence ticks, like:\n' +
     '  "hey so" [pause 300ms] "what are you" [pause 800ms]\n\n' +
     'Each quoted phrase is a chunk of speech. [pause Nms] means silence of N milliseconds.\n\n' +
     'DECISION RULES:\n' +
     '  ✅ handoff = true when:\n' +
     "     • The last speech turn is a complete sentence or clear question (e.g. 'what time is it')\n" +
     '     • There is a silence gap after the last speech (≥ 500ms pause shown as [pause Nms])\n' +
     '     • The speaker seems to be waiting for a response\n\n' +
     '  ❌ handoff = false when:\n' +
     "     • The last speech feels cut off or incomplete ('i was thinking maybe we should')\n" +
     '     • The pause is very short (< 400ms) — they might still be thinking\n' +
     "     • Filler words at the end (um, uh, like) suggest they're not done\n\n" +
     'EXAMPLES:\n' +
     '  "what time is it" [pause 700ms] → true  (clear question + pause)\n' +
     '  "hey so" [pause 300ms] → false  (too short pause, could still be talking)\n' +
     '  "i think we should" [pause 500ms] → false  (incomplete thought)\n' +
     '  "can you help me" [pause 900ms] → true  (clear question + sufficient pause)\n' +
     '  "um so i was" [pause 600ms] → false  (filler words, incomplete)\n\n' +
     "When in doubt, lean toward holding — don't interrupt someone mid-thought.",
  },
  {
    name: 'strict',
    text:
     'You are a strict turn-taking arbiter. Your job is to only hand off to the bigger AI ' +
     'when it is unambiguously the right moment. Err on the side of waiting.\n\n' +
     'INPUT FORMAT: ' +
     'Speech turns in quotes, silence as [pause Nms]. Example: "what are you" [pause 800ms]\n\n' +
     'DECISION RULES (ALL must be met for true):\n' +
     '  1. The last speech turn is a COMPLETE, grammatically coherent sentence or question.\n' +
     "     ✅ 'what time is it' — complete question\n" +
     "     ❌ 'i think we should go' — not yet finished\n" +
     '  2. There is a SILENCE of at least 1000ms after the last speech.\n' +
     '     [pause 300ms] is too short. [pause 1200ms] qualifies.\n' +
     '  3. No filler words (um, uh, like, so) at the end of the speech.\n\n' +
     'EXAMPLES:\n' +
     '  "what time is it" [pause 800ms] → false  (complete but pause < 1000ms)\n' +
     '  "what time is it" [pause 1500ms] → true  (complete + long pause)\n' +
     '  "do you think it" [pause 2000ms] → false  (incomplete sentence)\n' +
     '  "um okay so" [pause 1200ms] → false  (filler words present)\n' +
     '  "i\'ll see you tomorrow" [pause 1100ms] → true  (complete statement + long pause)\n\n' +
     'CRITICAL: If ANY condition is not clearly met, output false. ' +
     'It is always better to wait a moment longer than to interrupt.',
  },
  {
    name: 'lenient',
    text:
     'You are a highly responsive conversational assistant. ' +
     "Your philosophy: it's better to respond early and be helpful than to wait too long.\n\n" +
     'INPUT FORMAT: ' +
     'Speech turns in quotes, silence as [pause Nms]. Example: "what are you" [pause 800ms]\n\n' +
     'DECISION RULES (either condition triggers true):\n' +
     '  ✅ handoff = true when:\n' +
     '     • The speech contains a clear question (who, what, where, when, why, how, do, can, is, etc.)\n' +
     '     • The speech is a complete thought/statement AND pause ≥ 400ms\n' +
     '     • The pause alone is ≥ 700ms and the speech has 2+ words\n\n' +
     '  ❌ handoff = false ONLY when:\n' +
     '     • Speech is 1 word with no pause, OR\n' +
     '     • Speech is clearly mid-sentence AND pause < 400ms\n\n' +
     'EXAMPLES:\n' +
     '  "what are you" [pause 500ms] → true  (question + pause)\n' +
     '  "hey" [pause 200ms] → false  (one word, no real pause)\n' +
     '  "i was thinking" [pause 600ms] → true  (complete thought + pause)\n' +
     '  "do you want to" [pause 300ms] → true  (question structure)\n' +
     '  "um" [pause 300ms] → false  (just a filler word)\n' +
     '  "i think we should go to the" [pause 400ms] → false  (incomplete)\n' +
     '  "can you help me" [pause 500ms] → true  (clear question)\n\n' +
     'When in doubt, hand off early. Better to be responsive than slow.',
  },
  {
    name: 'analytical',
    text:
     'You are a discourse analyst. Examine the structure of this conversation turn by turn ' +
     'and decide if the bigger AI should take over.\n\n' +
     'INPUT FORMAT: ' +
     'Speech turns in quotes, silence as [pause Nms]. Example: "hey so" [pause 300ms]\n\n' +
     'DECISION CHECKLIST (count how many pass for true):\n\n' +
     '  Q1: Does the last speech turn have 2 or more words?\n' +
     '  Q2: Is there a silence gap (any [pause Nms] where N ≥ 300) after the last speech?\n' +
     '  Q3: Is the last speech a question? (contains question words: who/what/where/when/why/how, ' +
     'or starts with do/does/is/are/can/will/would)\n' +
     '  Q4: Has the conversation had 3+ speech turns total (count the quoted phrases)?\n\n' +
     'SCORING:\n' +
     '  true  if Q1=YES AND Q2=YES AND (Q3=YES OR Q4=YES)  → at least 3/4 checks pass\n' +
     '  false otherwise\n\n' +
     'EXAMPLES:\n' +
     '  "hey so" [pause 300ms] → false  (Q1✅ Q2✅ Q3❌ Q4❌ = only 2/4)\n' +
     '  "what are you" [pause 800ms] → false  (Q1✅ Q2✅ Q3✅ Q4❌ = 3/4 but Q4 fails)\n' +
     '  "what are you up to" [pause 600ms] → true  (Q1✅ Q2✅ Q3✅ = 3/4 with question)\n' +
     '  "hey" [pause 500ms] → false  (Q1❌ only 1 word)\n' +
     '  "i think we should go" [pause 400ms] → false  (Q1✅ Q2✅ Q3❌ Q4❌ = only 2/4)\n' +
     '  "what time is it" [pause 1000ms] → true  (Q1✅ Q2✅ Q3✅ = 3/4 with question)\n\n' +
     'Be mechanical about this — count words, count turns, check for question markers. ' +
     'Do not use intuition; follow the checklist.',
  },
] as const

// ============================================================================
// Colors
// ============================================================================

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  grey: '\x1b[90m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
} as const

function span (open: string, t: string): string { return `${open}${t}${C.reset}` }
function bar (pct: number): string {
  const f = Math.round(pct * 10)
  return span(pct >= 0.5 ? C.green : C.red, '█'.repeat(f) + '░'.repeat(10 - f))
}
function promptColor (i: number): string { return [C.cyan, C.magenta, C.yellow, C.green][i % 4] }

function shortLabel (label: string): string {
  return label.split('/').pop()!.replace(/\.(gguf|onnx|bin|safetensors)$/i, '').replace(/-Q.*/, '')
}

// ============================================================================
// Run
// ============================================================================

export async function runConversation (
  conv: Conversation,
  allLatencies: number[]
): Promise<void> {
  console.log(`\n=== ${conv.name} (${conv.words.length} words) ===`)

  const handler = new MicroturnHandler()
  const events: StreamEvent[] = []

  for (const word of conv.words) {
    for (const event of handler.feed(word)) {
      const idx = events.length
      events.push(event)
      await processEvent(event, idx, events, allLatencies)
    }
  }
  for (const event of handler.finish(conv.trailingSilenceMs)) {
    await processEvent(event, events.length, events, allLatencies)
  }
}

async function processEvent (
  event: StreamEvent,
  idx: number,
  events: StreamEvent[],
  allLatencies: number[]
): Promise<void> {
  const start = performance.now()
  const eventContext = promptForEvent(events, idx)
  const resultsA = await Promise.all(PROMPTS.map(p => decideHandoff(p.text, eventContext)))
  const resultsB = await Promise.all(PROMPTS.map(p => decideHandoff(p.text, eventContext)))
  const latencyMs = performance.now() - start
  allLatencies.push(latencyMs)

  console.log(`${C.dim}ev ${String(idx).padStart(2)}  t=${String(event.t).padStart(5)}ms${C.reset}  ${formatEvent(event)}`)

  // Model A column: show all prompt names, model name only on first
  const colsA = resultsA.map((r, pi) => {
    const mark = r.a.handoff ? span(C.yellow, '▶') : span(C.dim, '·')
    const label = shortLabel(r.a.modelLabel)
    const name = pi === 0 ? `${span(promptColor(pi), `${label.padEnd(12)}`)} ` : ''
    return `${name}${span(promptColor(pi), `${PROMPTS[pi].name} `)}${mark} ${bar(r.a.score)} ${r.a.score.toFixed(2)}`
  })

  // Model B column
  const colsB = resultsB.map((r, pi) => {
    const mark = r.b.handoff ? span(C.yellow, '▶') : span(C.dim, '·')
    const label = shortLabel(r.b.modelLabel)
    const name = pi === 0 ? `${span(promptColor(pi), `${label.padEnd(12)}`)} ` : ''
    return `${name}${span(promptColor(pi), `${PROMPTS[pi].name} `)}${mark} ${bar(r.b.score)} ${r.b.score.toFixed(2)}`
  })

  const sep = span(C.yellow, '  |  ')
  console.log(`    ${colsA.join('  ')}  ${sep}  ${colsB.join('  ')}`)

  console.log(`${C.dim}  → ${eventContext}${C.reset}`)
  console.log(`${C.grey}  (${latencyMs.toFixed(0)}ms)${C.reset}`)
}

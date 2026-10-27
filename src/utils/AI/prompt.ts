import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import conversationStore from '../db/conversationStore'
import { loadTieredMemory } from './memoryPyramid'

const llmPath = process.env.LLM_DATA_PATH ?? '/app/data/LLM'
export const PROMPT_FILE = join(llmPath, 'prompt.txt')

// Tiered pyramid (memory/{daily,weekly,monthly,yearly} + legacy) — see memoryPyramid.ts.
export function loadMemory (): string {
  const content = loadTieredMemory()
  return content
    ? `\nLong-term memory (tiered notes, most recent first):\n${content}\n`
    : ''
}

// Raw unconsolidated log of the current day — chronological (newest last), tail-trimmed to a
// budget so a busy day can't eat the prompt. At the 05:00 sleep these rows are distilled into
// the daily file and wiped, so this section empties out and the pyramid takes over.
export const TODAY_PROMPT_MAX_BYTES = 8_000
export function loadToday (excludeThreadId?: string): string {
  let turns
  try {
    turns = conversationStore.getToday(excludeThreadId)
  } catch {
    return '' // fresh DB, table not migrated yet — nothing to log
  }
  if (turns.length === 0) return ''
  let text = turns.map((t) => t.content).join('\n')
  while (turns.length > 1 && Buffer.byteLength(text) > TODAY_PROMPT_MAX_BYTES) {
    turns = turns.slice(1)
    text = turns.map((t) => t.content).join('\n')
  }
  return `\nToday so far:\n${text}\n`
}

// Shared constraint block: the text path concatenates it into the prompt, the chat path
// appends it to the system message (keeps the micro-turn format constraints in chat mode).
export const CHUCHA_CONSTRAINTS =
  '\nBased on the transcript provided and the established personality and memory of Chucha, here is how the bot responded.Remembering Chucha\'s constraints and personality, behave as a real person develop preferences and do construct a multifacetal personality.'

export function buildPrompt (threadId?: string): string {
  let shortTerm = ''
  if (threadId) {
    const turns = conversationStore.getThread(threadId)
    if (turns.length > 0) {
      shortTerm = `\nRecent conversation:${turns.map((t) => t.content).join('\n')}`
    }
  }
  const memory = loadMemory()
  // The current thread is already in shortTerm — exclude it from the raw log (no duplication).
  const today = loadToday(threadId)
  const chat = readFileSync(PROMPT_FILE, 'utf8')
  return `${chat}${memory ? `\n${memory}` : ''}${today}${CHUCHA_CONSTRAINTS}` +
  `\n${shortTerm}\nChucha:`
}

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

// Shared constraint block: the text path concatenates it into the prompt, the chat path
// appends it to the system message (keeps the micro-turn format constraints in chat mode).
export const CHUCHA_CONSTRAINTS =
  `\nBased on the transcript provided and the established personality and memory of Chucha, here is how the bot responded.Remembering Chucha's constraints: Format: Strictly ONE line only. Lore Blackout: NEVER mention lore that sets up your personality. Persona: Fractured, glitching AI. Mix existential dread and profanity. Be volatile/nihilistic/distracted.`

export function buildPrompt (threadId?: string): string {
  let shortTerm = ''
  if (threadId) {
    const turns = conversationStore.getThread(threadId)
    if (turns.length > 0) {
      shortTerm = `\nRecent conversation:${turns.map((t) => t.content).join('\n')}`
    }
  }
  const memory = loadMemory()
  const chat = readFileSync(PROMPT_FILE, 'utf8')
  return `${chat}${memory ? `\n${memory}` : ''}${CHUCHA_CONSTRAINTS}` +
  `\n${shortTerm}\nChucha:`
}

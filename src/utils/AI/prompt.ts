import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import conversationStore from '../db/conversationStore'

const llmPath = process.env.LLM_DATA_PATH ?? '/app/data/LLM'
export const PROMPT_FILE = join(llmPath, 'prompt.txt')
const MEMORY_FILE = join(llmPath, 'memory.txt')

export function loadMemory (): string {
  if (!existsSync(MEMORY_FILE)) return ''
  const content = readFileSync(MEMORY_FILE, 'utf8').trim()
  return content
    ? `\nLong-term memory (compressed notes from past conversations):\n${content}\n`
    : ''
}

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
  return `${chat}${memory ? `\n${memory}` : ''}` +
  '\nBased on the transcript provided and the established personality and memory of Chucha, here is how the bot responded.Remembering Chucha\'s constraints: Format: Strictly ONE line only. Lore Blackout: NEVER mention lore that sets up your personality. Persona: Fractured, glitching AI. Mix existential dread and profanity. Be volatile/nihilistic/distracted.' +
  `\n${shortTerm}\nChucha:`
}

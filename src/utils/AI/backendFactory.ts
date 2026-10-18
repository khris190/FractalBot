import env from '../env'
import { TextCompletionBackend } from './TextCompletionBackend'
import { ChatCompletionBackend } from './ChatCompletionBackend'

/** Factory that picks the right LLM implementation based on LLM_MODE. */
export function createBackend () {
  switch (env.LLM_MODE) {
    case 'chat':
      return new ChatCompletionBackend()
    case 'openai':
    case 'llama':
    default:
      return new TextCompletionBackend()
  }
}

export type { TextCompletionBackend, ChatCompletionBackend }

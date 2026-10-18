import env from '../env'
import getLogger from '../logger/getLogger'
import { TextCompletionBackend } from './TextCompletionBackend'
import { ChatCompletionBackend } from './ChatCompletionBackend'

/** Factory that picks the right LLM implementation based on LLM_MODE. */
export function createBackend () {
  switch (env.LLM_MODE) {
    case 'chat':
      return new ChatCompletionBackend()
    case 'openai':
    case 'llama':
      return new TextCompletionBackend()
    default:
      getLogger('ai-factory').warn(
        `unknown LLM_MODE '${env.LLM_MODE}', falling back to text completion backend`
      )
      return new TextCompletionBackend()
  }
}

export type { TextCompletionBackend, ChatCompletionBackend }

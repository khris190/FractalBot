import { readFileSync } from 'node:fs'
import env from '../env'
import conversationStore from '../db/conversationStore'
import { loadMemory, PROMPT_FILE } from './prompt'
import { ChatCompletionRequest } from './types'

/** OpenAI /v1/chat/completions (system + user messages) */
export class ChatCompletionBackend {
  async request (
    _prompt: string,
    maxTokens: number,
    temperature: number,
    stop: string[],
    threadId?: string
  ): Promise<string> {
    const systemMessage = this.buildSystemMessage()
    const userContent = this.buildUserContent(threadId)

    const payload: ChatCompletionRequest = {
      model: env.LLM_MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent },
      ],
      max_tokens: maxTokens,
      temperature,
      stop,
      frequency_penalty: 10.0,
      // Ask thinking models to spend less on reasoning; some finetuned models ignore it
      ...(env.LLM_REASONING_EFFORT ? { reasoning_effort: env.LLM_REASONING_EFFORT } : {}),
    }

    const response = await fetch(env.LLM_ENDPOINT + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const raw = await response.text()
    let data: any
    try {
      data = JSON.parse(raw)
    } catch (e) {
      throw new Error(`non-JSON response: ${raw.slice(0, 500)}`)
    }

    // {choices:[{message:{content}}]}
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return '' // treat as empty → caller retries
    }
    return content.trim()
  }

  private buildSystemMessage (): string {
    const memory = loadMemory()
    const chat = readFileSync(PROMPT_FILE, 'utf8')
    return `${chat}${memory ? `\n${memory}` : ''}`
  }

  private buildUserContent (threadId?: string): string {
    let shortTerm = ''
    if (threadId) {
      const turns = conversationStore.getThread(threadId)
      if (turns.length > 0) {
        shortTerm = turns.map((t) => t.content).join('\n')
      }
    }
    return `${shortTerm}\nChucha:`
  }
}

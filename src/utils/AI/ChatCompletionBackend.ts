import { readFileSync } from 'node:fs'
import env from '../env'
import conversationStore from '../db/conversationStore'
import { loadMemory, PROMPT_FILE, CHUCHA_CONSTRAINTS } from './prompt'
import { ChatCompletionRequest, ChatContentPart } from './types'

/** OpenAI /v1/chat/completions (system + user messages) */
export class ChatCompletionBackend {
  async request (
    _prompt: string,
    maxTokens: number,
    temperature: number,
    stop: string[],
    threadId?: string,
    imageUrl?: string
  ): Promise<string> {
    const systemMessage = this.buildSystemMessage()
    const userContent = this.buildUserContent(threadId)
    // Multimodal only when an image is present — keeps the plain-string payload for text-only turns
    const userMessage: string | ChatContentPart[] = imageUrl
      ? [{ type: 'text', text: userContent }, { type: 'image_url', image_url: { url: imageUrl } }]
      : userContent

    const payload: ChatCompletionRequest = {
      model: env.LLM_MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature,
      stop,
      // spec max (OpenAI range [-2, 2]) — keeps strong repetition suppression without 400-ing on strict servers
      frequency_penalty: 2.0,
      // Ask thinking models to spend less on reasoning; some finetuned models ignore it
      ...(env.LLM_REASONING_EFFORT ? { reasoning_effort: env.LLM_REASONING_EFFORT } : {}),
      // LLM_THINKING=off: verified switch — disable thinking entirely (no reasoning_content)
      ...(env.LLM_THINKING === 'off' ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    }

    const response = await fetch(env.LLM_ENDPOINT + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
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
    // Same constraint block the text path concatenates into its prompt (micro-turn format etc.)
    return `${chat}${memory ? `\n${memory}` : ''}${CHUCHA_CONSTRAINTS}`
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

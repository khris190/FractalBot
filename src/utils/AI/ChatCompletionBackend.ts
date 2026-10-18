import { readFileSync } from 'node:fs'
import env from '../env'
import conversationStore from '../db/conversationStore'
import { loadMemory, PROMPT_FILE, CHUCHA_CONSTRAINTS } from './prompt'
import { ChatCompletionRequest, ChatContentPart } from './types'

// Word-boundary "think" at the start of a message (case-insensitive), optionally followed by ":" and/or whitespace
const THINK_TRIGGER = /^\s*think(?:\s*:\s*|\s|$)/i

export function isThinkMessage (s: string): boolean {
  return THINK_TRIGGER.test(s)
}

// Strip the leading "think" trigger (and any ":") so the model sees a clean question
export function stripThinkPrefix (s: string): string {
  return s.replace(THINK_TRIGGER, '')
}

// Strip leading "chucha:" speaker labels from a response (all leading occurrences, case-insensitive)
export function stripChuchaPrefix (s: string): string {
  return s.replace(/^(?:\s*chucha\s*:\s*)+/i, '').trim()
}

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
    const { content: userContent, think } = this.buildUserContent(threadId)
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
      // LLM_THINKING=off: verified switch — disable thinking entirely (no reasoning_content);
      // a current message starting with "think" re-enables it for that one message
      ...(env.LLM_THINKING === 'off' && !think ? { chat_template_kwargs: { enable_thinking: false } } : {}),
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
    // The finetune sometimes repeats the "Chucha:" speaker label — strip it before returning
    return stripChuchaPrefix(content)
  }

  private buildSystemMessage (): string {
    const memory = loadMemory()
    const chat = readFileSync(PROMPT_FILE, 'utf8')
    // Same constraint block the text path concatenates into its prompt (micro-turn format etc.)
    return `${chat}${memory ? `\n${memory}` : ''}${CHUCHA_CONSTRAINTS}`
  }

  private buildUserContent (threadId?: string): { content: string, think: boolean } {
    let turns: string[] = []
    if (threadId) {
      turns = conversationStore.getThread(threadId).map((t) => t.content)
    }
    // "think" prefix on the current (last) turn enables thinking for this one request only;
    // stripped from the payload — the stored turn itself is left untouched
    const think = turns.length > 0 && isThinkMessage(turns[turns.length - 1])
    if (think) {
      turns = [...turns.slice(0, -1), stripThinkPrefix(turns[turns.length - 1])]
    }
    return { content: `${turns.join('\n')}\nChucha:`, think }
  }
}

import env from '../env'
import { LlamaCompletionRequest, OpenAICompletionRequest } from './types'

/** llama.cpp /completion + OpenAI /v1/completions (text concatenation) */
export class TextCompletionBackend {
  private readonly openai: boolean

  constructor () {
    this.openai = env.LLM_MODE === 'openai'
  }

  async request (
    prompt: string,
    n_predict: number,
    temperature: number,
    stop: string[],
    _threadId?: string,
    // Text endpoints can't do vision — image is ignored here (handled upstream)
    _imageUrl?: string
  ): Promise<string> {
    const url = env.LLM_ENDPOINT + (this.openai ? '/v1/completions' : '/completion')

    const payload = this.openai
      ? ({
          model: env.LLM_MODEL,
          prompt,
          max_tokens: n_predict,
          temperature,
          stop,
          // spec max (OpenAI range [-2, 2]) — keeps strong repetition suppression without 400-ing on strict servers
          frequency_penalty: 2.0,
        } as OpenAICompletionRequest)
      : ({
          prompt,
          n_predict,
          temperature,
          stop,
          // strong but sane (llama.cpp default is 1.1); 10.0 risked degraded generation
          repeat_penalty: 2.0,
        } as LlamaCompletionRequest)

    const response = await fetch(url, {
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

    // llama.cpp: {content}; OpenAI: {choices:[{text}]}
    const content =
      typeof data.content === 'string' ? data.content : data.choices?.[0]?.text
    if (typeof content !== 'string') {
      return '' // treat as empty → caller retries
    }
    return content.trim()
  }
}

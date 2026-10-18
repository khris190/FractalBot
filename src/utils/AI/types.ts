// --- Request types ---

export interface LlamaCompletionRequest {
  prompt: string
  n_predict: number
  temperature: number
  stop: string[]
  repeat_penalty: number
}

export interface OpenAICompletionRequest {
  model: string
  prompt: string
  max_tokens: number
  temperature: number
  stop: string[]
  frequency_penalty: number
}

export interface ChatCompletionRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  max_tokens: number
  temperature: number
  stop: string[]
  frequency_penalty: number
  // Optional (thinking models only); omitted when LLM_REASONING_EFFORT is unset
  reasoning_effort?: string
}

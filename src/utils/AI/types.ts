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

/** OpenAI-style multimodal content part (text + image_url); image_url carries a base64 data URL */
export type ChatContentPart =
  | { type: 'text', text: string }
  | { type: 'image_url', image_url: { url: string } }

export interface ChatCompletionRequest {
  model: string
  // string = text-only; part array = multimodal (used when an image is attached)
  messages: Array<{ role: string; content: string | ChatContentPart[] }>
  max_tokens: number
  temperature: number
  stop: string[]
  frequency_penalty: number
  // Optional (thinking models only); omitted when LLM_REASONING_EFFORT is unset
  reasoning_effort?: string
  // Optional (Qwen3-style chat templates); sent when LLM_THINKING=off
  chat_template_kwargs?: { enable_thinking?: boolean }
}

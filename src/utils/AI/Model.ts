import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import env from '../env'
import ILogger from '../logger/ILogger'
import getLogger from '../logger/getLogger'
import { full } from '@huggingface/transformers'

export interface ModelImageData {
  data: string; id: number
}
interface LlamaCompletionRequest {
  prompt: string | { prompt_string: string, multimodal_data: string }[];
  n_predict: number;
  temperature: number;
  stop: string[];
  repeat_penalty: number;
}

const llmPath = join('/app', 'data', 'LLM')
interface LlamaCompletionResponse {
  content: string;
  generation_settings: any;
  model: string;
  prompt: string;
  stop: boolean;
  stopped_word: string;
  tokens_predicted: number;
}
export default class Model {
  chat: string
  thoughts?: string
  busy: boolean = false
  logger: ILogger = getLogger('model')

  constructor () {
    this.logger.info('Chucha LLM STARTING')
    this.chat = readFileSync(join(llmPath, 'prompt.txt'), 'utf8')
    try {
      this.thoughts = readFileSync(join(llmPath, 'thoughts.txt'), 'utf8')
    } catch (error) {
      this.logger.warn('no thoughts.txt file')
    }
    // preload cache
    (async () => {
      try {
        await this.chatWithChucha('Ready?')
        this.logger.info('Chucha LLM READY')
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        this.logger.error('Preload failed: ' + errorMessage)
      }
    })()
  }

  async chatWithChucha (userInput: string, img?: string, thoughts?:string
  ): Promise<string> {
    let fullPrompt = `${this.chat}`
    thoughts ??= this.thoughts
    fullPrompt += `${userInput}`
    if (thoughts) {
      fullPrompt += `\n${thoughts}\n`
    } else fullPrompt += '\nChucha: '
    return await this.complete(fullPrompt, img)
  }

  async complete (fullPrompt: string, image?: string) {
    if (this.busy) throw new Error('LLM Busy')
    this.busy = true
    const url = env.LLM_ENDPOINT + '/completion'
    const payload: LlamaCompletionRequest = {
      prompt: fullPrompt,
      n_predict: 256,
      temperature: 1.0,
      stop: ['\n'],
      // stop: [],
      repeat_penalty: 1.1,
    }
    if (image) {
      payload.prompt = [{ prompt_string: fullPrompt, multimodal_data: image }]
    }
    this.logger.error('payload', payload)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`)
      }

      const data = (await response.json()) as LlamaCompletionResponse
      const res = data.content.trim()

      writeFileSync(join(llmPath, 'history.txt'), `${fullPrompt}${res}\n\n`, { flag: 'a+' })
      return res
    } finally {
      this.busy = false
    }
  }
}

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import env from '../env'
import ILogger from '../logger/ILogger'
import getLogger from '../logger/getLogger'
interface LlamaCompletionRequest {
  prompt: string;
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
  busy: boolean = false
  logger: ILogger = getLogger('model')

  constructor () {
    this.logger.info('Chucha STARTING')
    this.chat = readFileSync(join(llmPath, 'prompt.txt'), 'utf8');
    // preload cache
    (async () => {
      await this.chatWithChucha('a?')
      this.logger.info('Chucha READY')
    })()
  }

  async chatWithChucha (userInput: string): Promise<string> {
    if (this.busy) {
      throw new Error('LLM Busy')
    }

    this.busy = true
    const url = env.LLM_ENDPOINT + '/completion'
    const fullPrompt = `${this.chat}${userInput}\nChucha:`

    const payload: LlamaCompletionRequest = {
      prompt: fullPrompt,
      n_predict: 100,
      temperature: 1.0,
      stop: ['\n'],
      repeat_penalty: 10.0,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    this.busy = false

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = (await response.json()) as LlamaCompletionResponse
    const res = data.content.trim()
    writeFileSync(join(llmPath, 'history.txt'), `${userInput}\nChucha:${res}\n\n`, { flag: 'a+' })
    return res
  }
}

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import env from '../env'
import ILogger from '../logger/ILogger'
import getLogger from '../logger/getLogger'
import conversationStore from '../db/conversationStore'

interface LlamaCompletionRequest {
  prompt: string;
  n_predict: number;
  temperature: number;
  stop: string[];
  repeat_penalty: number;
}

const llmPath = join('/app', 'data', 'LLM')
const PROMPT_FILE = join(llmPath, 'prompt.txt')
const MEMORY_FILE = join(llmPath, 'memory.txt')
const MEMORY_TMP_FILE = join(llmPath, 'memoryTMP.txt')
const HISTORY_FILE = join(llmPath, 'history.txt')

// Max bytes before memory.txt gets auto-compressed via LLM on next append
const MEMORY_MAX_SIZE = 10_000

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
  #queue: Promise<unknown> = Promise.resolve()

  constructor () {
    this.logger.info('Chucha LLM STARTING')
    this.chat = readFileSync(PROMPT_FILE, 'utf8');
    // preload cache (queued like everything else)
    this.enqueue(() => this.complete(`${this.chat}Ready?\nChucha:`))
      .then(() => this.logger.info('Chucha LLM READY'))
  }

  private loadMemory (): string {
    if (!existsSync(MEMORY_FILE)) return ''
    const content = readFileSync(MEMORY_FILE, 'utf8').trim()
    return content ? `\nLong-term memory (compressed notes from past conversations):\n${content}\n` : ''
  }

  private buildPrompt (threadId?: string): string {
    let shortTerm = ''
    if (threadId) {
      const turns = conversationStore.getThread(threadId)
      if (turns.length > 0) {
        // turns are stored pre-formatted ("Name: text" / "Chucha: response")
        shortTerm = `\nRecent conversation:\n${turns.map(t => t.content).join('\n')}\n`
      }
    }

    // prompt.txt ends with a newline; keep "Chucha:" on its own line
    const memory = this.loadMemory()
    return `${this.chat}\n${memory ? `\n${memory}` : ''}${shortTerm}Chucha:`
  }

  // Serialize all LLM calls through a promise chain (model is single-flight);
  // errors propagate to the caller but never break the queue for later tasks.
  private enqueue<T> (fn: () => Promise<T>): Promise<T> {
    const prev = this.#queue
    let release!: () => void
    this.#queue = new Promise<void>(res => { release = res })

    return prev.then(() => fn()).then(
      v => { release(); return v },
      e => { release(); throw e }
    )
  }

  private async complete (prompt: string, n_predict = 100, temperature = 1.0, stop: string[] = ['\n']): Promise<string> {
    // Serialization is guaranteed by the queue; a task may make several LLM calls
    // in sequence (e.g. consolidate → compress), so no busy check here.
    this.busy = true
    try {
      const url = env.LLM_ENDPOINT + '/completion'
      const payload: LlamaCompletionRequest = {
        prompt,
        n_predict,
        temperature,
        stop,
        repeat_penalty: 10.0,
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = (await response.json()) as LlamaCompletionResponse
      return data.content.trim()
    } finally {
      this.busy = false
    }
  }

  // Generate Chucha's reply for a conversation thread. Caller must have stored the
  // current user turn in the DB first; the last stored turn is what we respond to.
  async chatWithChucha (threadId?: string): Promise<string> {
    return await this.enqueue(async () => {
      const turns = threadId ? conversationStore.getThread(threadId) : []
      const userInput = turns.length > 0 ? turns[turns.length - 1].content : ''

      const res = await this.complete(this.buildPrompt(threadId))

      // Audit log only — raw input/output pair, never read back by the model
      writeFileSync(HISTORY_FILE, `${userInput}\nChucha:${res}\n\n`, { flag: 'a+' })
      return res
    })
  }

  // Distill ALL short-term conversations into long-term notes via LLM (slow),
  // append to memory.txt, then clear the short-term DB.
  async consolidateMemory (): Promise<void> {
    return await this.enqueue(async () => {
      const allThreads = conversationStore.getAllThreads()
      if (allThreads.size === 0) return

      let transcript = ''
      for (const [threadId, turns] of allThreads) {
        transcript += `Conversation ${threadId}:\n${turns.map(t => t.content).join('\n')}\n\n`
      }

      const compressionPrompt = `Summarize these Discord conversations into concise notes worth remembering long-term: what happened, who said important things, facts about people. Be brief.\n\n${transcript}\n\nNotes:`
      const notes = await this.complete(compressionPrompt, 300, 0.3)

      if (notes) {
        // already inside the queue — use the raw writer to avoid re-enqueueing
        await this.doAppendMemory(notes)
      }
      conversationStore.clearAll()
    })
  }

  // Append notes to memory.txt (atomic swap); auto-compresses existing file first if too big (slow)
  async appendMemory (notes: string): Promise<void> {
    return await this.enqueue(() => this.doAppendMemory(notes))
  }

  private async doAppendMemory (notes: string): Promise<void> {
    let existing = existsSync(MEMORY_FILE) ? readFileSync(MEMORY_FILE, 'utf8') : ''

    const candidate = existing + notes.trim() + '\n'
    if (Buffer.byteLength(candidate) > MEMORY_MAX_SIZE && existing.length > 0) {
      await this.compressMemoryFile()
      existing = readFileSync(MEMORY_FILE, 'utf8')
    }

    // Atomic swap: write to TMP then rename over memory.txt
    writeFileSync(MEMORY_TMP_FILE, existing + notes.trim() + '\n')
    renameSync(MEMORY_TMP_FILE, MEMORY_FILE)
  }

  // Compress memory.txt into a smaller version via LLM (atomic swap, slow).
  // Must be called from within an enqueued task.
  private async compressMemoryFile (): Promise<void> {
    const content = readFileSync(MEMORY_FILE, 'utf8')
    const compressionPrompt = `Compress these conversation notes into fewer, more concise lines. Keep all important facts.\n\n${content}\n\nCompressed notes:`

    const compressed = await this.complete(compressionPrompt, 500, 0.2)

    // Atomic swap: write to TMP then rename over memory.txt
    writeFileSync(MEMORY_TMP_FILE, compressed + '\n')
    renameSync(MEMORY_TMP_FILE, MEMORY_FILE)
  }
}

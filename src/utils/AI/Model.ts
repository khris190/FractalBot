import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import env from '../env'
import ILogger from '../logger/ILogger'
import getLogger from '../logger/getLogger'
import conversationStore from '../db/conversationStore'
import { createBackend } from './backendFactory'
import { loadMemory, buildPrompt } from './prompt'

const MEMORY_FILE = join(env.LLM_DATA_PATH, 'memory.txt')
const MEMORY_TMP_FILE = join(env.LLM_DATA_PATH, 'memoryTMP.txt')
const HISTORY_FILE = join(env.LLM_DATA_PATH, 'history.txt')

const MEMORY_MAX_SIZE = 10_000
const MAX_ATTEMPTS = 5
const THINKING_STOP_STRINGS = ['<think>', '</think>']

// Backend contract — both TextCompletionBackend and ChatCompletionBackend implement this
interface LLMBackend {
  request(
    prompt: string,
    n_predict: number,
    temperature: number,
    stop: string[],
    threadId?: string
  ): Promise<string>
}

export default class Model {
  busy: boolean = false
  logger: ILogger = getLogger('model')
  #queue: Promise<unknown> = Promise.resolve()
  private readonly backend: LLMBackend

  constructor () {
    this.logger.info('Chucha LLM STARTING')
    this.backend = createBackend()
    // preload cache (queued like everything else); a failure here must not kill the bot
    this.enqueue(() => this.complete(`${buildPrompt()}User:Ready?\nChucha:`, 2, 1.0, ['\n']))
      .then(() => this.logger.info('Chucha LLM READY'))
      .catch((e) => this.logger.error('Chucha LLM preload failed', e as Error))
  }

  // Serialize all LLM calls through a promise chain (model is single-flight);
  // errors propagate to the caller but never break the queue for later tasks.
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.#queue
    let release!: () => void
    this.#queue = new Promise<void>((res) => {
      release = res
    })

    return prev
      .then(() => fn())
      .then(
        (v) => {
          release()
          return v
        },
        (e) => {
          release()
          throw e
        }
      )
  }

  private async complete (
    prompt: string,
    n_predict = 100,
    temperature = 1.0,
    extraStop: string[] = ['\n'],
    threadId?: string
  ): Promise<string> {
    this.busy = true
    try {
      const stop = [...THINKING_STOP_STRINGS, ...extraStop]
      let lastError: unknown
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let content: string
        try {
          content = await this.backend.request(
            prompt,
            n_predict,
            temperature,
            stop,
            threadId
          )
        } catch (e) {
          // Transient failures (server down, HTTP error, non-JSON, timeout) are retried like empties
          lastError = e
          this.logger.warn(
            `LLM request failed (attempt ${attempt}/${MAX_ATTEMPTS})`, e as Error
          )
          continue
        }
        if (content !== '') return content
        this.logger.warn(
          `LLM returned an empty response (attempt ${attempt}/${MAX_ATTEMPTS})`
        )
      }
      if (lastError) {
        throw new Error(`LLM request failed after ${MAX_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
      }
      throw new Error(`LLM returned an empty response after ${MAX_ATTEMPTS} attempts`)
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

      // 500: budget leaves headroom for reasoning models to spend tokens thinking and still emit an answer
      const res = await this.complete(buildPrompt(threadId), 500, 1.0, ['\n'], threadId)

      // Audit log only — raw input/output pair, never read back by the model
      writeFileSync(HISTORY_FILE, `${userInput}\nChucha:${res}\n\n`, {
        flag: 'a+',
      })
      return res
    })
  }

  // Distill short-term conversations into long-term notes via LLM (slow), append to memory.txt,
  // then clear the short-term DB — EXCEPT high-upvote answers, which are kept as a permanent
  // "best messages" archive (flagged promoted so later runs don't re-distill them).
  async consolidateMemory (): Promise<void> {
    return await this.enqueue(async () => {
      const allThreads = conversationStore.getAllThreads()
      if (allThreads.size === 0) return

      let transcript = ''
      const toPromote: string[] = []
      for (const [threadId, turns] of allThreads) {
        const kept = turns.filter((t) => {
          if (t.promoted) return false
          if (t.role === 'assistant' && t.downvotes > t.upvotes) return false
          return true
        })
        for (const t of turns) {
          if (
            t.role === 'assistant' &&
            !t.promoted &&
            t.upvotes > t.downvotes &&
            t.messageId
          ) {
            toPromote.push(t.messageId)
          }
        }
        if (kept.length > 0) {
          transcript += `Conversation ${threadId}:\n${kept.map((t) => t.content).join('\n')}\n\n`
        }
      }

      if (transcript.trim() === '') return

      const compressionPrompt = `${loadMemory()}${transcript}Summarize these Discord conversations also taking into consideration previous memory into concise notes worth remembering long-term: what happened, who said important things, facts about people. Be brief.\nNotes:`
      const notes = await this.complete(compressionPrompt, 1000, 1.0, ['\n'])

      if (notes) {
        await this.doAppendMemory(notes)
      }
      conversationStore.markPromoted(toPromote)
      conversationStore.clearUnpromoted()
    })
  }

  async appendMemory (notes: string): Promise<void> {
    return await this.enqueue(() => this.doAppendMemory(notes))
  }

  private async doAppendMemory (notes: string): Promise<void> {
    let existing = existsSync(MEMORY_FILE)
      ? readFileSync(MEMORY_FILE, 'utf8')
      : ''

    const candidate = existing + notes.trim() + '\n'
    if (Buffer.byteLength(candidate) > MEMORY_MAX_SIZE && existing.length > 0) {
      await this.compressMemoryFile()
      existing = readFileSync(MEMORY_FILE, 'utf8')
    }

    writeFileSync(MEMORY_TMP_FILE, existing + notes.trim() + '\n')
    renameSync(MEMORY_TMP_FILE, MEMORY_FILE)
  }

  private async compressMemoryFile (): Promise<void> {
    const content = readFileSync(MEMORY_FILE, 'utf8')
    const compressionPrompt = `Compress these conversation notes into fewer, more concise lines. Keep all important facts.\n\n${content}\n\nCompressed notes:`

    const compressed = await this.complete(compressionPrompt, 2000, 1.0, ['\n'])

    writeFileSync(MEMORY_TMP_FILE, compressed + '\n')
    renameSync(MEMORY_TMP_FILE, MEMORY_FILE)
  }
}

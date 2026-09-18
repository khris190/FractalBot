import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import env from '../env'
import ILogger from '../logger/ILogger'
import getLogger from '../logger/getLogger'
import conversationStore from '../db/conversationStore'

// llama.cpp /completion request
interface LlamaCompletionRequest {
  prompt: string;
  n_predict: number;
  temperature: number;
  stop: string[];
  repeat_penalty: number;
}

// OpenAI-compatible (LM Studio) /v1/completions request
interface OpenAICompletionRequest {
  model: string;
  prompt: string;
  max_tokens: number;
  temperature: number;
  stop: string[];
  frequency_penalty: number;
}

const llmPath = env.LLM_DATA_PATH
const PROMPT_FILE = join(llmPath, 'prompt.txt')
const MEMORY_FILE = join(llmPath, 'memory.txt')
const MEMORY_TMP_FILE = join(llmPath, 'memoryTMP.txt')
const HISTORY_FILE = join(llmPath, 'history.txt')

// Max bytes before memory.txt gets auto-compressed via LLM on next append
const MEMORY_MAX_SIZE = 10_000
// Small local models occasionally return nothing (e.g. they start "thinking" and hit the stop string immediately) — retry a few times before giving up
const MAX_ATTEMPTS = 5
// Stop generation if the model starts emitting thinking tags, so it can't burn the whole token budget on reasoning
const THINKING_STOP_STRINGS = ['<think>', '</think>']

export default class Model {
  chat: string
  busy: boolean = false
  logger: ILogger = getLogger('model')
  #queue: Promise<unknown> = Promise.resolve()

  constructor () {
    this.logger.info('Chucha LLM STARTING')
    this.chat = readFileSync(PROMPT_FILE, 'utf8')
    // preload cache (queued like everything else); a failure here must not kill the bot
    this.enqueue(() => this.complete(`${this.buildPrompt()}Ready?\nChucha:`, 2))
      .then(() => this.logger.info('Chucha LLM READY'))
      .catch((e) => this.logger.error('Chucha LLM preload failed', e as Error))
  }

  private loadMemory (): string {
    if (!existsSync(MEMORY_FILE)) return ''
    const content = readFileSync(MEMORY_FILE, 'utf8').trim()
    return content
      ? `\nLong-term memory (compressed notes from past conversations):\n${content}\n`
      : ''
  }

  private buildPrompt (threadId?: string): string {
    let shortTerm = ''
    if (threadId) {
      const turns = conversationStore.getThread(threadId)
      if (turns.length > 0) {
        // turns are stored pre-formatted ("Name: text" / "Chucha: response")
        shortTerm = `\nRecent conversation:\n${turns.map((t) => t.content).join('\n')}\n`
      }
    }

    // prompt.txt ends with a newline; keep "Chucha:" on its own line
    const memory = this.loadMemory()
    return `${this.chat}\n${memory ? `\n${memory}` : ''}` +
    '\nBased on the transcript provided and the established personality and memory of Chucha, here is how the bot responded.Remembering Chucha\'s constraints: Format: Strictly ONE line only. Lore Blackout: NEVER mention lore that sets up your personality. Persona: Fractured, glitching AI. Mix existential dread and profanity. Be volatile/nihilistic/distracted.' +
    `\n${shortTerm}Chucha:`
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
    extraStop: string[] = ['\n']
  ): Promise<string> {
    // Serialization is guaranteed by the queue; a task may make several LLM calls
    // in sequence (e.g. consolidate → compress), so no busy check here.
    this.busy = true
    try {
      const stop = [...THINKING_STOP_STRINGS, ...extraStop]
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const content = await this.requestCompletion(
          prompt + `${THINKING_STOP_STRINGS[0]}Context loaded. Persona: Chucha. Tone: Blunt, unfiltered, anti-corporate/anti-mundane. Constraint: <100 tokens total output. No meta-commentary. Just the raw response to the current chat state. The soup rant is done. Next move? Stay in character. Maybe react to the silence or double down on the absurdity. Keep it short. Swear if needed. Don't explain. Just be Chucha.${THINKING_STOP_STRINGS[1]}`,
          n_predict,
          temperature,
          stop
        )
        if (content !== '') return content
        this.logger.warn(
          `LLM returned an empty response (attempt ${attempt}/${MAX_ATTEMPTS})`
        )
      }
      console.log()
      throw new Error(`LLM returned an empty response after ${MAX_ATTEMPTS} attempts`)
    } finally {
      this.busy = false
    }
  }

  private async requestCompletion (
    prompt: string,
    n_predict: number,
    temperature: number,
    stop: string[]
  ): Promise<string> {
    const openai = env.LLM_MODE === 'openai'
    const url = env.LLM_ENDPOINT + (openai ? '/v1/completions' : '/completion')
    // llama.cpp: n_predict/repeat_penalty; OpenAI-compatible: max_tokens/frequency_penalty
    const payload = openai
      ? ({
          model: env.LLM_MODEL,
          prompt,
          max_tokens: n_predict,
          temperature,
          stop,
          frequency_penalty: 10.0,
        } as OpenAICompletionRequest)
      : ({
          prompt,
          n_predict,
          temperature,
          stop,
          repeat_penalty: 10.0,
        } as LlamaCompletionRequest)

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

    // llama.cpp echoes the full prompt back in the response, so keep logged bodies short
    const raw = await response.text()
    let data: any
    try {
      data = JSON.parse(raw)
    } catch (e) {
      this.logger.error(
        'LLM returned non-JSON response',
        new Error(`body: ${raw.slice(0, 500)}`)
      )
      throw e
    }
    // llama.cpp returns {content}; OpenAI-compatible returns {choices:[{text}]}
    const content =
      typeof data.content === 'string' ? data.content : data.choices?.[0]?.text
    if (typeof content !== 'string') {
      this.logger.error(
        'LLM response missing content field',
        new Error(`keys: ${Object.keys(data).join(',')} body: ${raw.slice(0, 500)}`)
      )
      return '' // treat as empty → caller retries
    }
    return content.trim()
  }

  // Generate Chucha's reply for a conversation thread. Caller must have stored the
  // current user turn in the DB first; the last stored turn is what we respond to.
  async chatWithChucha (threadId?: string): Promise<string> {
    return await this.enqueue(async () => {
      const turns = threadId ? conversationStore.getThread(threadId) : []
      const userInput = turns.length > 0 ? turns[turns.length - 1].content : ''

      const res = await this.complete(this.buildPrompt(threadId))

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
        // Per-turn filter:
        //  - downvoted assistant answers (more 👎 than 👍) are dropped from the transcript
        //  - already-promoted rows were distilled in a previous run → skip so they're not re-added
        const kept = turns.filter((t) => {
          if (t.promoted) return false
          if (t.role === 'assistant' && t.downvotes > t.upvotes) return false
          return true
        })
        // High-upvote answers get distilled this run AND archived for the future.
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

      if (transcript.trim() === '') return // nothing new to distill

      const compressionPrompt = `${this.loadMemory()}${transcript}Summarize these Discord conversations also taking into consideration previous memory into concise notes worth remembering long-term: what happened, who said important things, facts about people. Be brief.\nNotes:`
      const notes = await this.complete(compressionPrompt, 1000)

      if (notes) {
        // already inside the queue — use the raw writer to avoid re-enqueueing
        await this.doAppendMemory(notes)
      }
      conversationStore.markPromoted(toPromote)
      conversationStore.clearUnpromoted()
    })
  }

  // Append notes to memory.txt (atomic swap); auto-compresses existing file first if too big (slow)
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

    // Atomic swap: write to TMP then rename over memory.txt
    writeFileSync(MEMORY_TMP_FILE, existing + notes.trim() + '\n')
    renameSync(MEMORY_TMP_FILE, MEMORY_FILE)
  }

  // Compress memory.txt into a smaller version via LLM (atomic swap, slow).
  // Must be called from within an enqueued task.
  private async compressMemoryFile (): Promise<void> {
    const content = readFileSync(MEMORY_FILE, 'utf8')
    const compressionPrompt = `Compress these conversation notes into fewer, more concise lines. Keep all important facts.\n\n${content}\n\nCompressed notes:`

    const compressed = await this.complete(compressionPrompt, 2000)

    // Atomic swap: write to TMP then rename over memory.txt
    writeFileSync(MEMORY_TMP_FILE, compressed + '\n')
    renameSync(MEMORY_TMP_FILE, MEMORY_FILE)
  }
}

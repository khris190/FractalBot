import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'
import env from '../env'
import ILogger from '../logger/ILogger'
import getLogger from '../logger/getLogger'
import conversationStore from '../db/conversationStore'
import { createBackend } from './backendFactory'
import { loadMemory, buildPrompt } from './prompt'
import { ensureLayout, dailyFile, distillFile, archiveFile, warsawYmd, nextPromotionUnit, PromotionUnit } from './memoryPyramid'

const HISTORY_FILE = join(env.LLM_DATA_PATH, 'history.txt')

const MAX_ATTEMPTS = 5
const THINKING_STOP_STRINGS = ['<think>', '</think>']

// Backend contract — both TextCompletionBackend and ChatCompletionBackend implement this
interface LLMBackend {
  request(
    prompt: string,
    n_predict: number,
    temperature: number,
    stop: string[],
    threadId?: string,
    imageUrl?: string,
    // Consolidation/compression calls: neutral note-taker system + raw prompt as user message
    noteTaker?: boolean,
    // Short utility calls (image captions): skip reasoning entirely so small token budgets hold
    noThink?: boolean
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
    threadId?: string,
    imageUrl?: string,
    noteTaker = false,
    noThink = false
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
            threadId,
            imageUrl,
            noteTaker,
            noThink
          )
        } catch (e) {
          // Transient failures (server down, HTTP error, non-JSON, timeout) are retried like empties
          lastError = e
          this.logger.warn(`LLM request failed (attempt ${attempt}/${MAX_ATTEMPTS})`)
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
  // imageUrl (optional): base64 data URL of the current message's image attachment —
  // sent as an image_url part by the chat backend; ignored by the text backend.
  async chatWithChucha (threadId?: string, imageUrl?: string): Promise<string> {
    return await this.enqueue(async () => {
      const turns = threadId ? conversationStore.getThread(threadId) : []
      const userInput = turns.length > 0 ? turns[turns.length - 1].content : ''

      // 500: budget leaves headroom for reasoning models to spend tokens thinking and still emit an answer
      const res = await this.complete(buildPrompt(threadId), 500, 1.0, ['\n'], threadId, imageUrl)

      // Audit log only — raw input/output pair, never read back by the model
      writeFileSync(HISTORY_FILE, `${userInput}\nChucha:${res}\n\n`, {
        flag: 'a+',
      })
      return res
    })
  }

  // One-line caption for an image attachment — stored with the turn so the model can remember
  // what the image showed (the images themselves are never stored). Text backends can't see
  // images, so there is nothing to caption there.
  async captionImage (dataUrl: string): Promise<string | undefined> {
    if (env.LLM_MODE !== 'chat') return undefined
    return await this.enqueue(async () => {
      // noThink: reasoning models would burn the whole budget on reasoning_content and return
      // empty content (finish_reason: length) — with thinking off, 40 tokens are plenty for a
      // ≤20-word caption.
      const caption = (await this.complete(
        'Describe this image in one short factual phrase, max 20 words, no preamble.\nCaption:',
        40, 1.0, ['\n'], undefined, dataUrl, true, true
      )).trim()
      return caption || undefined
    })
  }

  // Distill short-term conversations into long-term notes via LLM (slow) and append them to the
  // daily file of the day the conversations happened (tiered pyramid — see memoryPyramid.ts),
  // then delete ALL rows: the memory files ARE the archive, the DB keeps nothing.
  // Highly-rated answers (upvotes > downvotes, or leftovers flagged promoted by an earlier run)
  // get a ⭐ marker so the LLM weighs them when writing the notes.
  // Downvoted answers are distilled nowhere and simply deleted. If the LLM call fails, the rows
  // are left untouched and get another chance on the next run.
  async consolidateMemory (): Promise<void> {
    return await this.enqueue(async () => {
      const allThreads = conversationStore.getAllThreads()
      if (allThreads.size === 0) return

      let transcript = ''
      let newestRow: Date | null = null
      for (const [threadId, turns] of allThreads) {
        const kept = turns.filter((t) => !(t.role === 'assistant' && t.downvotes > t.upvotes))
        for (const t of kept) {
          // sqlite current_timestamp = 'YYYY-MM-DD HH:MM:SS' UTC — the daily file is dated by the
          // conversation, not by when the distill runs (the 05:00 sleep distills the previous day).
          const created = new Date(t.createdAt.replace(' ', 'T') + 'Z')
          if (!newestRow || created > newestRow) newestRow = created
        }
        if (kept.length > 0) {
          transcript += `Conversation ${threadId}:\n${kept
            .map((t) => (t.promoted || (t.role === 'assistant' && t.upvotes > t.downvotes))
              ? `⭐ highly-rated answer: ${t.content}`
              : t.content)
            .join('\n')}\n\n`
        }
      }

      if (transcript.trim() === '') return

      const compressionPrompt = `${loadMemory()}${transcript}Summarize these Discord conversations also taking into consideration previous memory into concise notes worth remembering long-term: what happened, who said what (multi-person chat — attribute statements to their speaker), facts about people. Be brief; keep the notes mostly neutral and factual — a hint of Chucha's voice is fine, rambling is not. ⭐-marked answers were highly rated by the user and are especially worth remembering.\nNotes:`
      const notes = await this.complete(compressionPrompt, 1000, 1.0, ['\n'], undefined, undefined, true)

      if (notes) {
        const ymd = warsawYmd(newestRow ?? new Date())
        // Quality artifact: the exact transcript sent to the LLM, kept per conversation day
        // (written before the rows are deleted so it survives the wipe).
        writeFileSync(distillFile(ymd), `--- run ${new Date().toISOString()} ---\n${transcript}\n`, { flag: 'a+' })
        await this.doAppendMemory(notes, ymd)
      }
      conversationStore.clearAll()
    })
  }

  async appendMemory (notes: string): Promise<void> {
    return await this.enqueue(async () => {
      this.doAppendMemory(notes, warsawYmd(new Date()))
    })
  }

  private doAppendMemory (notes: string, ymd: string): void {
    ensureLayout()
    writeFileSync(dailyFile(ymd), notes.trim() + '\n', { flag: 'a+' })
  }

  // Promote complete calendar units one tier up: week → month → year (see memoryPyramid.ts).
  // One unit per LLM call; input files are deleted only after the merged file is written, so a
  // failed merge keeps its inputs and retries on the next run. Loops until nothing is pending.
  async promoteMemory (): Promise<void> {
    return await this.enqueue(async () => {
      for (;;) {
        const unit = nextPromotionUnit(new Date())
        if (!unit) return
        await this.mergeUnit(unit)
      }
    })
  }

  private async mergeUnit (unit: PromotionUnit): Promise<void> {
    const input = unit.inputs
      .map((f) => `## ${basename(f, '.txt')}\n${readFileSync(f, 'utf8').trim()}`)
      .join('\n\n')
    let prompt = `Merge these ${unit.tier} notes into a single set of notes. Keep ALL facts and attribute statements to their speaker; mostly neutral and factual. The result must fit in at most ${unit.capLines} lines.\n\n${input}\n\nMerged notes:`
    let merged = (await this.complete(prompt, 1000, 1.0, ['\n'], undefined, undefined, true)).trim()

    if (merged.split('\n').length > unit.capLines) {
      // One stricter pass — the first merge sometimes overruns the cap.
      prompt = `Compress the following notes into at most ${unit.capLines} lines. Keep every fact and the speaker attribution.\n\n${merged}\n\nCompressed notes:`
      merged = (await this.complete(prompt, 1000, 1.0, ['\n'], undefined, undefined, true)).trim()
      if (merged.split('\n').length > unit.capLines) {
        this.logger.warn(`merged ${unit.tier} notes still exceed ${unit.capLines} lines — writing anyway`)
      }
    }

    // Quality artifact: keep the merged input notes (the "old values") out of the prompt and
    // out of the way of future promotions — the pyramid only scans the tier dirs.
    writeFileSync(archiveFile(unit.key), input + '\n')
    writeFileSync(unit.target, merged + '\n')
    for (const f of unit.inputs) unlinkSync(f)
    this.logger.info(`memory: merged ${unit.inputs.length} ${unit.inputs.map((f) => basename(f)).join(', ')} → ${basename(unit.target)}`)
  }
}

import type { StreamEvent, SpeechEvent, SilenceEvent, WordEvent } from './types'

/**
 * MicroturnHandler: word stream -> speech microturns + silence events.
 *
 * Words arriving within 300 ms of each other are grouped into a microturn
 * (max 2 words). Gaps over 400 ms close the microturn and emit growing
 * silence events (every 300 ms of pause, with cumulative duration).
 */
export class MicroturnHandler {
  private static readonly SPEECH_WINDOW_MS = 300
  private static readonly SILENCE_THRESHOLD_MS = 400
  private static readonly MAX_WORDS_PER_MICROTURN = 2

  private events: StreamEvent[] = []
  private buffer: WordEvent[] = []
  private lastT: number | undefined

  /** Feed one spoken word; returns any events it produced (0–2). */
  feed (word: WordEvent): StreamEvent[] {
    const produced: StreamEvent[] = []

    if (this.lastT !== undefined) {
      const gap = word.t - this.lastT
      if (gap > MicroturnHandler.SILENCE_THRESHOLD_MS) {
        // User stopped: close the open microturn, then report growing silence.
        const flushed = this.flushBuffer()
        if (flushed) produced.push(flushed)
        for (
          let d = MicroturnHandler.SPEECH_WINDOW_MS;
          d <= gap;
          d += MicroturnHandler.SPEECH_WINDOW_MS
        ) {
          produced.push(
            this.emit({ kind: 'silence', t: this.lastT + d, duration: d })
          )
        }
      } else if (this.buffer.length > 0 && gap > MicroturnHandler.SPEECH_WINDOW_MS) {
        // New phrase, too quick for silence: just close the microturn.
        const flushed = this.flushBuffer()
        if (flushed) produced.push(flushed)
      }
    }

    this.buffer.push(word)
    this.lastT = word.t

    if (this.buffer.length >= MicroturnHandler.MAX_WORDS_PER_MICROTURN) {
      const flushed = this.flushBuffer()
      if (flushed) produced.push(flushed)
    }

    return produced
  }

  /** End of stream: close open microturn + emit trailing silence events. */
  finish (trailingSilenceMs: number): StreamEvent[] {
    const produced: StreamEvent[] = []
    const flushed = this.flushBuffer()
    if (flushed) produced.push(flushed)
    const start = this.lastT ?? 0
    for (
      let d = MicroturnHandler.SPEECH_WINDOW_MS;
      d <= trailingSilenceMs;
      d += MicroturnHandler.SPEECH_WINDOW_MS
    ) {
      produced.push(this.emit({ kind: 'silence', t: start + d, duration: d }))
    }
    // Report the exact final duration too (when it doesn't align with 300 ms).
    if (trailingSilenceMs % MicroturnHandler.SPEECH_WINDOW_MS !== 0) {
      produced.push(
        this.emit({
          kind: 'silence',
          t: start + trailingSilenceMs,
          duration: trailingSilenceMs,
        })
      )
    }
    return produced
  }

  private flushBuffer (): StreamEvent | undefined {
    if (this.buffer.length === 0) return undefined
    const words = this.buffer.map((w) => w.word)
    const t = this.buffer[0].t
    this.buffer = []
    return this.emit({ kind: 'speech', t, words })
  }

  private emit (
    event: Omit<SpeechEvent, 'index'> | Omit<SilenceEvent, 'index'>
  ): StreamEvent {
    const full = { ...event, index: this.events.length } as StreamEvent
    this.events.push(full)
    return full
  }
}

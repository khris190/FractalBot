import type { StreamEvent } from './types'
import { HISTORY_WINDOW } from './config'

/** Format a single event for display and prompt building. */
export function formatEvent (event: StreamEvent): string {
  return event.kind === 'speech'
    ? `"${event.words.join(' ')}"`
    : `[pause ${event.duration}ms]`
}

/**
 * Build the prompt text that gets sent as the `instructions` field
 * inside the handoff question to /v1/systemone.
 *
 * Consecutive silence ticks collapse into one entry — an ongoing pause is
 * a single evolving number, so only the latest duration is shown.
 */
export function promptForEvent (events: StreamEvent[], latestIndex: number): string {
  const window = events.slice(
    Math.max(0, latestIndex + 1 - HISTORY_WINDOW),
    latestIndex + 1
  )
  const rendered: string[] = []
  let prev: StreamEvent | undefined
  for (const event of window) {
    if (event.kind === 'silence' && prev?.kind === 'silence') {
      rendered[rendered.length - 1] = formatEvent(event) // grow, don't append
    } else {
      rendered.push(formatEvent(event))
    }
    prev = event
  }
  return `${rendered.join(' ')} handoff?`
}

import Client from '../Client'

// Dynamic Discord activity — what Chucha is doing right now.
// Dreaming (memory consolidation) wins over answering: that's what happens while sleeping,
// and a sleeping Chucha ignores everyone (the ping handler checks isDreaming before queueing).
// Counters, not booleans — overlapping runs must not clear the activity until the LAST one ends.
const IDLE_ACTIVITY = 'Balala'
const ANSWERING_ACTIVITY = '💬 answering'
const DREAMING_ACTIVITY = '🌙 dreaming'

let answering = 0
let dreaming = 0

function refresh (): void {
  const activity = dreaming > 0 ? DREAMING_ACTIVITY : answering > 0 ? ANSWERING_ACTIVITY : IDLE_ACTIVITY
  Client.client?.user?.setActivity(activity)
}

export const status = {
  beginAnswering (): void { answering++; refresh() },
  endAnswering (): void { if (answering > 0) answering--; refresh() },
  beginDreaming (): void { dreaming++; refresh() },
  endDreaming (): void { if (dreaming > 0) dreaming--; refresh() },
  isDreaming (): boolean { return dreaming > 0 },
}

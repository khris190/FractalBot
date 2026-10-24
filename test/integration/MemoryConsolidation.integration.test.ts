/**
 * INTEGRATION — memory consolidation against the local LLM (llama.cpp serving the
 * finetuned Pantheon-Reasoning model). Real network, slow. Fails hard with a clear
 * message if the server is unreachable (by design: no auto-skip).
 * Shape assertions only — the distilled notes are printed for MANUAL approval
 * (user + maintainer); semantic quality is never asserted.
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LLM_HOST = '192.168.100.21:1234'

const dir = mkdtempSync(join(tmpdir(), 'fractal-integ-consolidate-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
process.env.LLM_DATA_PATH = join(dir, 'LLM')
process.env.LLM_ENDPOINT = LLM_HOST
process.env.LLM_MODE = 'chat'
process.env.LLM_MODEL = 'local'
// No thinking — keeps the run fast and the notes clean (verified switch for this finetune)
process.env.LLM_THINKING = 'off'

mkdirSync(process.env.LLM_DATA_PATH!)
writeFileSync(join(process.env.LLM_DATA_PATH!, 'prompt.txt'), 'You are Chucha.\n')

// Mock DailyRoll before anything loads getLogger — keeps the process from hanging.
const dailyRollPath = require.resolve('../../src/utils/logger/pino-daily-roll')
require.cache[dailyRollPath] = { id: dailyRollPath, filename: dailyRollPath, loaded: true, exports: () => ({ write: () => {}, flush: () => {}, end: () => {} }) } as any

// Passthrough fetch wrapper: captures request payloads, forwards to the real server.
interface Captured { url: string, body: any }
const captured: Captured[] = []
const realFetch = globalThis.fetch.bind(globalThis)
;(globalThis as any).fetch = async (url: string, init: any) => {
  if (init?.body) captured.push({ url: String(url), body: JSON.parse(init.body) })
  return realFetch(url, init)
}

const { default: db } = require('../../src/utils/db/db') as typeof import('../../src/utils/db/db')
const conversationStore = (require('../../src/utils/db/conversationStore') as typeof import('../../src/utils/db/conversationStore')).default
const Model = (require('../../src/utils/AI/Model') as typeof import('../../src/utils/AI/Model')).default
const { dailyFile, warsawYmd } = require('../../src/utils/AI/memoryPyramid') as typeof import('../../src/utils/AI/memoryPyramid')

// Tests don't run drizzle migrations — create the table by hand (same as unit tests).
db.$client.exec(`CREATE TABLE IF NOT EXISTS \`conversationTurn\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`threadId\` text NOT NULL,
  \`messageId\` text,
  \`role\` text NOT NULL,
  \`content\` text NOT NULL,
  \`upvotes\` integer NOT NULL DEFAULT 0,
  \`downvotes\` integer NOT NULL DEFAULT 0,
  \`promoted\` integer NOT NULL DEFAULT 0,
  \`createdAt\` text DEFAULT (current_timestamp) NOT NULL
); CREATE UNIQUE INDEX IF NOT EXISTS \`conversationTurn_messageId_unique\` ON \`conversationTurn\` (\`messageId\`)`)

// Seed uses the production storage format: user turns "<name>: <message>" (LLMPingResponseHandler.prepareThread),
// assistant turns "Chucha: <reply>". Multi-person on purpose — attribution must survive distillation.
const THREAD = 'seed-1'
const STARRED_ANSWER = "Chucha: I'm the local Pantheon-Reasoning-26B finetune, served by llama.cpp on the home network — nothing in the cloud."
const USER_FACT = "Krzysztof: fyi, I'm moving to Gdańsk in November and the internet might be down for a few days"
const ALICE_FACT = "Alice: it's a big port city, Krzysztof's just dramatic about the move"
const DOWNVOTED_ANSWER = 'Chucha: Gdańsk? Never heard of it. Probably a small town.'

let model: InstanceType<typeof Model>

before(async () => {
  // Hard-fail with a clear message when the local model is down (no auto-skip).
  try {
    const res = await realFetch(`http://${LLM_HOST}/v1/models`, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (e: any) {
    throw new Error(`Local LLM unavailable at http://${LLM_HOST} — start the local server to run integration tests (probe failed: ${e?.message ?? e})`)
  }
  // Seed one multi-person thread: a ⭐ highly-rated answer (2👍), a downvoted answer
  // (1👎) that must be excluded from the transcript, and a second human (Alice).
  conversationStore.addTurn(THREAD, 'seed-1', 'user', 'Krzysztof: chucha: what are you actually running on right now, the big model or the small one?')
  conversationStore.addTurn(THREAD, 'seed-2', 'assistant', STARRED_ANSWER)
  conversationStore.recordVote('seed-2', true, true)
  conversationStore.recordVote('seed-2', true, true)
  conversationStore.addTurn(THREAD, 'seed-3', 'user', 'Alice: ooo cool, so if the internet dies you are basically a haunted router?')
  conversationStore.addTurn(THREAD, 'seed-4', 'assistant', 'Chucha: A haunted router with delusions of grandeur. Yes. That is the job description.')
  conversationStore.addTurn(THREAD, 'seed-5', 'user', USER_FACT)
  conversationStore.addTurn(THREAD, 'seed-6', 'assistant', DOWNVOTED_ANSWER)
  conversationStore.recordVote('seed-6', false, true)
  conversationStore.addTurn(THREAD, 'seed-7', 'user', ALICE_FACT)
  conversationStore.addTurn(THREAD, 'seed-8', 'assistant', 'Chucha: A port city. So it is 50% water, 50% excuses for being offline. Noted, I guess.')

  // One shared instance: the constructor preload is queued first, so the last
  // captured request is always the consolidation call.
  model = new Model()
})

test('integration: consolidateMemory distills the seeded thread into the daily notes file and clears the DB', async () => {
  await model.consolidateMemory()

  // Seeded with current_timestamp → rows are dated today (Warsaw) → today's daily file.
  const notesPath = dailyFile(warsawYmd(new Date()))
  assert.ok(existsSync(notesPath), 'daily notes file should exist after consolidation')
  const notes = readFileSync(notesPath, 'utf8').trim()
  assert.ok(notes !== '', `expected non-empty distilled notes, got: ${JSON.stringify(notes)}`)

  console.log('\n=== DISTILLED NOTES — manual review (user + maintainer approve) ===')
  console.log(notes)
  console.log(`notes file: ${notesPath}\n`)

  assert.equal(conversationStore.getAllThreads().size, 0, 'DB must be fully cleared after a successful consolidation')
})

test('integration: consolidation prompt carries the ⭐ marker + transcript, excludes the downvoted answer', async () => {
  const req = captured[captured.length - 1]
  assert.ok(req.url.endsWith('/v1/chat/completions'), `url was ${req.url}`)
  const payload = JSON.stringify(req.body)
  assert.ok(payload.includes('⭐ highly-rated answer:'), 'starred marker missing from prompt')
  assert.ok(payload.includes(STARRED_ANSWER), 'starred answer missing from transcript')
  assert.ok(payload.includes(USER_FACT), 'user fact missing from transcript')
  assert.ok(payload.includes(ALICE_FACT), 'second human turn missing from transcript')
  assert.ok(!payload.includes(DOWNVOTED_ANSWER), 'downvoted answer must not reach the transcript')
  assert.ok(payload.includes('Notes:'), 'compression prompt tail missing')
})

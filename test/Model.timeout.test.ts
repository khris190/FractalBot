/**
 * Unit — fetch timeout (LLM_TIMEOUT_MS). The real 60s default would make tests slow,
 * so this file sets a small value via env (per-file process isolation) and uses a
 * fetch mock that honors the abort signal (a hung server).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Must be set BEFORE env is required.
const dir = mkdtempSync(join(tmpdir(), 'fractal-model-timeout-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
process.env.LLM_DATA_PATH = join(dir, 'LLM')
process.env.LLM_TIMEOUT_MS = '50'

mkdirSync(process.env.LLM_DATA_PATH!)
writeFileSync(join(process.env.LLM_DATA_PATH!, 'prompt.txt'), 'You are Chucha.\n')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: db } = require('../src/utils/db/db') as typeof import('../src/utils/db/db')
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

// Mock DailyRoll before anything loads getLogger.
const dailyRollPath = require.resolve('../src/utils/logger/pino-daily-roll')
require.cache[dailyRollPath] = { id: dailyRollPath, filename: dailyRollPath, loaded: true, exports: () => ({ write: () => {}, flush: () => {}, end: () => {} }) } as any

// Hung server: only resolves if the signal is never aborted in time.
;(globalThis as any).fetch = (url: string, init: any) => new Promise((resolve, reject) => {
  const t = setTimeout(
    () => resolve(new Response(JSON.stringify({ content: 'too late' }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    500
  )
  init.signal?.addEventListener('abort', () => {
    clearTimeout(t)
    reject(Object.assign(new Error('abort timeout exceeded'), { name: 'TimeoutError' }))
  })
})

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Model = (require('../src/utils/AI/Model') as typeof import('../src/utils/AI/Model')).default

test('hung requests are aborted after LLM_TIMEOUT_MS, retried, rejected; queue stays usable', async () => {
  const model = new Model()
  // constructor preload: 5 × 50ms of timeouts, swallowed by the constructor's catch
  await new Promise(r => setTimeout(r, 400))

  await assert.rejects(model.chatWithChucha(), /request failed after 5 attempts/)

  // queue still usable: a responsive server now succeeds
  ;(globalThis as any).fetch = async () => new Response(JSON.stringify({ content: 'alive' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  assert.equal(await model.chatWithChucha(), 'alive')
})

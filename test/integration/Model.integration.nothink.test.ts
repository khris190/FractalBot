/**
 * INTEGRATION — non-reasoning request against the local LLM (LLM_REASONING_EFFORT=minimal).
 * Real network, slow. Fails hard with a clear message if the server is unreachable.
 * NOTE: this finetuned model IGNORES reasoning_effort (verified: identical reasoning
 * with/without the flag) — so the test asserts shape only, not that thinking stopped.
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LLM_HOST = '192.168.100.21:1234'

const dir = mkdtempSync(join(tmpdir(), 'fractal-integ-nothink-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
process.env.LLM_DATA_PATH = join(dir, 'LLM')
process.env.LLM_ENDPOINT = LLM_HOST
process.env.LLM_MODE = 'chat'
process.env.LLM_MODEL = 'local'
process.env.LLM_REASONING_EFFORT = 'minimal'

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

const Model = (require('../../src/utils/AI/Model') as typeof import('../../src/utils/AI/Model')).default

let model: InstanceType<typeof Model>

before(async () => {
  // Hard-fail with a clear message when the local model is down (no auto-skip).
  try {
    const res = await realFetch(`http://${LLM_HOST}/v1/models`, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (e: any) {
    throw new Error(`Local LLM unavailable at http://${LLM_HOST} — start the local server to run integration tests (probe failed: ${e?.message ?? e})`)
  }
  model = new Model()
})

test('integration: non-reasoning request carries reasoning_effort=minimal', async () => {
  await model.chatWithChucha()
  for (const req of captured) {
    assert.equal(req.body.reasoning_effort, 'minimal', `request ${req.url} missing reasoning_effort=minimal`)
  }
})

test('integration: non-reasoning request still returns non-empty content (shape only — this model ignores the flag and still thinks)', async () => {
  const res = await model.chatWithChucha()
  assert.ok(typeof res === 'string' && res.trim() !== '', `expected non-empty string, got: ${JSON.stringify(res)}`)
})

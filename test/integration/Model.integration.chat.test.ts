/**
 * INTEGRATION — chat mode against the local LLM (llama.cpp serving the finetuned
 * Pantheon-Reasoning model). Real network, slow. Fails hard with a clear message
 * if the server is unreachable (by design: no auto-skip).
 * Shape assertions only — never assert on generated text content.
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LLM_HOST = '192.168.100.21:1234'

const dir = mkdtempSync(join(tmpdir(), 'fractal-integ-chat-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
process.env.LLM_DATA_PATH = join(dir, 'LLM')
process.env.LLM_ENDPOINT = LLM_HOST
process.env.LLM_MODE = 'chat'
process.env.LLM_MODEL = 'local'

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

// eslint-disable-next-line @typescript-eslint/no-var-requires
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
  // One shared instance: the constructor preload + queue serialization keep the
  // real request count minimal and the captured "last" request is always the
  // test's own call (preload is captured first, even if still in flight).
  model = new Model()
})

test('integration: chat mode returns non-empty content from the local model', async () => {
  const res = await model.chatWithChucha()
  assert.ok(typeof res === 'string' && res.trim() !== '', `expected non-empty string, got: ${JSON.stringify(res)}`)
})

test('integration: chat request is a well-formed OpenAI chat payload', async () => {
  const req = captured[captured.length - 1]
  assert.ok(req.url.endsWith('/v1/chat/completions'), `url was ${req.url}`)
  assert.equal(req.body.model, 'local')
  assert.equal(req.body.messages.length, 2)
  assert.equal(req.body.messages[0].role, 'system')
  assert.equal(req.body.messages[1].role, 'user')
  assert.ok(req.body.stop.includes('</think>'), 'thinking-tag stop present')
  assert.ok(!('n_predict' in req.body), 'llama.cpp field must not leak into chat payload')
})

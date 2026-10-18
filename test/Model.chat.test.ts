import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Chat mode — must be set BEFORE env is required.
const dir = mkdtempSync(join(tmpdir(), 'fractal-model-chat-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
process.env.LLM_DATA_PATH = join(dir, 'LLM')
process.env.LLM_MODE = 'chat'
process.env.LLM_MODEL = 'chat-model'

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

interface Captured { url: string, body: any }
let captured: Captured[] = []
type Responder = () => any
let responder: Responder = () => ({ choices: [{ message: { content: 'preload' } }] })
let rawBodies: unknown[] = []
// Per-fetch HTTP status overrides for error-path tests (default 200)
let statuses: number[] = []
;(globalThis as any).fetch = async (url: string, init: any) => {
  captured.push({ url, body: JSON.parse(init.body) })
  const status = statuses.length > 0 ? statuses.shift()! : 200
  const body = rawBodies.length > 0 ? rawBodies.shift()! : responder()
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Model = (require('../src/utils/AI/Model') as typeof import('../src/utils/AI/Model')).default
// eslint-disable-next-line @typescript-eslint/no-var-requires
const conversationStore = (require('../src/utils/db/conversationStore') as typeof import('../src/utils/db/conversationStore')).default

function reset () {
  captured = []
  responder = () => ({ choices: [{ message: { content: 'preload' } }] })
  rawBodies = []
  statuses = []
  conversationStore.clearAll()
  for (const f of ['memory.txt', 'memoryTMP.txt', 'history.txt']) {
    try { rmSync(join(process.env.LLM_DATA_PATH!, f)) } catch {}
  }
}

async function makeModel (): Promise<InstanceType<typeof Model>> {
  const model = new Model()
  await new Promise(r => setTimeout(r, 30))
  return model
}

test('chat mode posts to /v1/chat/completions', async () => {
  reset()
  const model = await makeModel()

  responder = () => ({ choices: [{ message: { content: 'hello' } }] })
  await model.chatWithChucha()

  const req = captured[captured.length - 1]
  assert.ok(req.url.endsWith('/v1/chat/completions'), `expected chat endpoint, got ${req.url}`)
  assert.equal(req.body.model, 'chat-model')
  assert.equal(req.body.messages.length, 2)
  assert.equal(req.body.messages[0].role, 'system')
  assert.equal(req.body.messages[1].role, 'user')
  assert.equal(req.body.reasoning_effort, undefined, 'reasoning_effort omitted when LLM_REASONING_EFFORT unset')
  // 500: headroom for reasoning models to still emit an answer (100 caused empty-content cascades)
  assert.equal(req.body.max_tokens, 500)
  assert.equal(req.body.temperature, 1.0)
})

test('chat mode: system message contains prompt.txt content', async () => {
  reset()
  writeFileSync(join(process.env.LLM_DATA_PATH!, 'prompt.txt'), 'You are Chucha. Be evil.\n')

  const model = await makeModel()
  responder = () => ({ choices: [{ message: { content: 'hi' } }] })
  await model.chatWithChucha()

  const req = captured[captured.length - 1]
  assert.ok(req.body.messages[0].content.includes('You are Chucha.'))
  assert.ok(req.body.messages[0].content.includes('Be evil.'))
})

test('chat mode: memory is included in the system message', async () => {
  reset()
  writeFileSync(join(process.env.LLM_DATA_PATH!, 'memory.txt'), 'Alice likes cats.\n')

  const model = await makeModel()
  responder = () => ({ choices: [{ message: { content: 'hi' } }] })
  await model.chatWithChucha()

  const req = captured[captured.length - 1]
  assert.ok(req.body.messages[0].content.includes('Alice likes cats.'))
  assert.ok(req.body.messages[0].content.includes('Long-term memory'))
})

test('chat mode: conversation turns appear in the user message', async () => {
  reset()
  conversationStore.addTurn('th1', 'm1', 'user', 'Alice: hello chucha')
  conversationStore.addTurn('th1', null, 'assistant', 'Chucha: hello alice')

  const model = await makeModel()
  responder = () => ({ choices: [{ message: { content: 'hi back' } }] })
  await model.chatWithChucha('th1')

  const req = captured[captured.length - 1]
  assert.ok(req.body.messages[1].content.includes('Alice: hello chucha'))
  assert.ok(req.body.messages[1].content.includes('Chucha: hello alice'))
  assert.ok(req.body.messages[1].content.trimEnd().endsWith('Chucha:'), 'user message ends with "Chucha:"')
})

test('chat mode: response parsing extracts message.content', async () => {
  reset()
  responder = () => ({
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'Chucha is here!' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  })
  const model = await makeModel()

  assert.equal(await model.chatWithChucha(), 'Chucha is here!')
})

test('chat mode: stop array includes thinking-tag stop strings', async () => {
  reset()
  responder = () => ({ choices: [{ message: { content: 'ok' } }] })
  const model = await makeModel()

  await model.chatWithChucha()

  const req = captured[captured.length - 1]
  assert.ok(req.body.stop.includes('<think>'))
  assert.ok(req.body.stop.includes('</think>'))
})

test('chat mode: empty responses are retried', async () => {
  reset()
  rawBodies = [{ choices: [{ message: { content: '' } }] }]
  responder = () => ({ choices: [{ message: { content: 'got it' } }] })
  const model = await makeModel()

  assert.equal(await model.chatWithChucha(), 'got it')
  // preload + 2 attempts
  assert.equal(captured.length, 3)
})

test('chat mode: malformed response (no content) is retried then throws', async () => {
  reset()
  // preload consumes one, responder is the fallback after rawBodies run out
  rawBodies = [
    { error: 'preload fallback' },
    { error: 'model not loaded' },
    { error: 'model not loaded' },
    { error: 'model not loaded' },
    { error: 'model not loaded' },
    { error: 'model not loaded' },
  ]
  responder = () => ({ error: 'model not loaded' }) // fallback for any calls after rawBodies
  const model = await makeModel()

  await assert.rejects(model.chatWithChucha(), /empty response after 5 attempts/)
})

test('chat mode: frequency_penalty is the in-spec max', async () => {
  reset()
  responder = () => ({ choices: [{ message: { content: 'hi' } }] })
  const model = await makeModel()

  await model.chatWithChucha()
  const req = captured[captured.length - 1]
  assert.equal(req.body.frequency_penalty, 2.0)
})

test('chat mode: HTTP errors are retried', async () => {
  reset()
  const model = await makeModel()

  statuses = [500]
  responder = () => ({ choices: [{ message: { content: 'back online' } }] })
  assert.equal(await model.chatWithChucha(), 'back online')
  // preload + failed attempt + success
  assert.equal(captured.length, 3)
})

test('chat mode: null content with reasoning_content (reasoning ate the budget) is retried', async () => {
  reset()
  const model = await makeModel()

  rawBodies = [{
    choices: [{
      message: { role: 'assistant', content: null, reasoning_content: 'thinking for a long time...' },
      finish_reason: 'length',
    }],
  }]
  responder = () => ({ choices: [{ message: { content: 'the answer' } }] })
  assert.equal(await model.chatWithChucha(), 'the answer')
})

test('chat mode: system message carries the shared constraint block', async () => {
  reset()
  responder = () => ({ choices: [{ message: { content: 'hi' } }] })
  const model = await makeModel()

  await model.chatWithChucha()
  const system = captured[captured.length - 1].body.messages[0].content
  assert.ok(system.includes('Strictly ONE line only'), 'format constraint present in chat mode')
  assert.ok(system.includes('Fractured, glitching AI'), 'persona constraint present in chat mode')
})

test('chat mode: concurrency is serialized (only one request at a time)', async () => {
  reset()
  responder = () => ({ choices: [{ message: { content: 'ok' } }] })
  const origFetch = (globalThis as any).fetch
  let active = 0
  let maxActive = 0
  // Track in-flight fetches around the REAL mock (delay makes overlap possible)
  ;(globalThis as any).fetch = async (url: string, init: any) => {
    active++
    maxActive = Math.max(maxActive, active)
    try {
      await new Promise(r => setTimeout(r, 20))
      return await origFetch(url, init)
    } finally {
      active--
    }
  }

  const model = await makeModel()
  await Promise.all([model.chatWithChucha(), model.chatWithChucha()])

  assert.equal(maxActive, 1, 'only one LLM request in flight at a time')
  ;(globalThis as any).fetch = origFetch
})

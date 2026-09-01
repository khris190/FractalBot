import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// OpenAI-compatible mode (LM Studio) — must be set BEFORE env is required.
const dir = mkdtempSync(join(tmpdir(), 'fractal-model-openai-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
process.env.LLM_DATA_PATH = join(dir, 'LLM')
process.env.LLM_MODE = 'openai'
process.env.LLM_MODEL = 'unsloth/qwen3.8-27b'

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
  \`createdAt\` text DEFAULT (current_timestamp) NOT NULL
); CREATE UNIQUE INDEX IF NOT EXISTS \`conversationTurn_messageId_unique\` ON \`conversationTurn\` (\`messageId\`)`)

// Mock DailyRoll before anything loads getLogger — keeps the process from hanging.
const dailyRollPath = require.resolve('../src/utils/logger/pino-daily-roll')
require.cache[dailyRollPath] = { id: dailyRollPath, filename: dailyRollPath, loaded: true, exports: () => ({ write: () => {}, flush: () => {}, end: () => {} }) } as any

interface Captured { url: string, body: any }
let captured: Captured[] = []
type Responder = (body: any) => unknown
let responder: Responder = () => ({ content: 'preload' })
;(globalThis as any).fetch = async (url: string, init: any) => {
  const body = JSON.parse(init.body)
  captured.push({ url, body })
  return new Response(JSON.stringify(responder(body)), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Model = (require('../src/utils/AI/Model') as typeof import('../src/utils/AI/Model')).default

async function makeModel (): Promise<InstanceType<typeof Model>> {
  const model = new Model()
  await new Promise(r => setTimeout(r, 30)) // let the constructor preload drain
  return model
}

test('openai mode posts to /v1/completions with OpenAI payload shape', async () => {
  captured = []
  responder = b => ({ id: 'cmpl-1', object: 'text_completion', choices: [{ index: 0, text: ' hello from lm studio' }], usage: {} })
  const model = await makeModel()

  const res = await model.chatWithChucha()
  assert.equal(res, 'hello from lm studio')

  const req = captured[captured.length - 1]
  assert.ok(req.url.endsWith('/v1/completions'), `url was ${req.url}`)
  assert.equal(req.body.model, 'unsloth/qwen3.8-27b')
  assert.equal(typeof req.body.max_tokens, 'number')
  assert.equal(typeof req.body.prompt, 'string')
  assert.ok(!('n_predict' in req.body), 'llama.cpp field must not leak into openai payload')
})

test('openai mode parses choices[0].text (the shape from the production log)', async () => {
  captured = []
  // exact shape LM Studio returned in the crash report
  responder = () => ({
    id: 'cmpl-qrrmvl0z4kl3mugpv5d8eo', object: 'text_completion', created: 1788284686,
    model: 'unsloth/qwen3.8-27b',
    choices: [{ index: 0, text: " I'll just spew", logprobs: null, finish_reason: 'stop' }],
    usage: { prompt_tokens: 2804, completion_tokens: 6, total_tokens: 2810 },
  })
  const model = await makeModel()

  assert.equal(await model.chatWithChucha(), "I'll just spew")
})

test('openai mode still accepts llama.cpp-style content responses (parser is shape-agnostic)', async () => {
  responder = () => ({ content: ' legacy llama response' })
  const model = await makeModel()
  assert.equal(await model.chatWithChucha(), 'legacy llama response')
})

test('openai mode sends thinking-tag stop strings', async () => {
  captured = []
  responder = () => ({ choices: [{ text: 'ok' }] })
  const model = await makeModel()

  await model.chatWithChucha()

  const req = captured[captured.length - 1]
  assert.deepEqual(req.body.stop, ['<think>', '</think>'])
})

test('openai mode retries on empty choices text', async () => {
  captured = []
  const model = await makeModel()
  let calls = 0
  responder = b => {
    if (b.prompt.includes('Ready?')) return { content: 'preload' } // constructor preload
    calls++
    return { choices: [{ index: 0, text: calls < 2 ? '' : 'done' }] }
  }
  assert.equal(await model.chatWithChucha(), 'done')
})

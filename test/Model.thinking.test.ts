import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// LLM_THINKING=off — must be set BEFORE env is required.
const dir = mkdtempSync(join(tmpdir(), 'fractal-model-thinking-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
process.env.LLM_DATA_PATH = join(dir, 'LLM')
process.env.LLM_MODE = 'chat'
process.env.LLM_MODEL = 'chat-model'
process.env.LLM_THINKING = 'OFF' // env is normalized to lowercase

mkdirSync(process.env.LLM_DATA_PATH!)
writeFileSync(join(process.env.LLM_DATA_PATH!, 'prompt.txt'), 'You are Chucha.\n')

// Mock DailyRoll before anything loads getLogger — keeps the process from hanging.
const dailyRollPath = require.resolve('../src/utils/logger/pino-daily-roll')
require.cache[dailyRollPath] = { id: dailyRollPath, filename: dailyRollPath, loaded: true, exports: () => ({ write: () => {}, flush: () => {}, end: () => {} }) } as any

interface Captured { url: string, body: any }
let captured: Captured[] = []
let responder: () => any = () => ({ choices: [{ message: { content: 'preload' } }] })
;(globalThis as any).fetch = async (url: string, init: any) => {
  captured.push({ url, body: JSON.parse(init.body) })
  return new Response(JSON.stringify(responder()), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Model = (require('../src/utils/AI/Model') as typeof import('../src/utils/AI/Model')).default

async function makeModel (): Promise<InstanceType<typeof Model>> {
  const model = new Model()
  await new Promise(r => setTimeout(r, 30)) // let the constructor preload drain
  return model
}

test('LLM_THINKING=off sends chat_template_kwargs.enable_thinking=false in the chat payload', async () => {
  captured = []
  responder = () => ({ choices: [{ message: { content: 'hi' } }] })
  const model = await makeModel()

  const res = await model.chatWithChucha()
  assert.equal(res, 'hi', 'response parsing is unaffected by the flag')

  const req = captured[captured.length - 1]
  assert.deepEqual(req.body.chat_template_kwargs, { enable_thinking: false })
})

test('enable_thinking=false is present on every request, including the constructor preload', async () => {
  captured = []
  responder = () => ({ choices: [{ message: { content: 'ok' } }] })
  const model = await makeModel()

  await model.chatWithChucha()
  for (const req of captured) {
    assert.deepEqual(req.body.chat_template_kwargs, { enable_thinking: false }, `request ${req.url} missing the thinking-off switch`)
  }
})

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

const Model = (require('../src/utils/AI/Model') as typeof import('../src/utils/AI/Model')).default

const conversationStore = (require('../src/utils/db/conversationStore') as typeof import('../src/utils/db/conversationStore')).default

function reset () {
  captured = []
  responder = () => ({ choices: [{ message: { content: 'preload' } }] })
  conversationStore.clearAll()
}

async function makeModel (): Promise<InstanceType<typeof Model>> {
  const model = new Model()
  await new Promise((resolve) => setTimeout(resolve, 30)) // let the constructor preload drain
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

test('LLM_THINKING=off: a "think"-prefixed message re-enables thinking for that one message', async () => {
  reset()
  conversationStore.addTurn('th1', 'm1', 'user', 'think: why is the sky blue')
  const model = await makeModel()

  responder = () => ({ choices: [{ message: { content: 'blue' } }] })
  await model.chatWithChucha('th1')

  const req = captured[captured.length - 1]
  assert.equal(req.body.chat_template_kwargs, undefined, 'per-message override drops the thinking-off switch')
  assert.ok(req.body.messages[1].content.includes('why is the sky blue'), 'prefix stripped, clean question kept')
  assert.ok(!req.body.messages[1].content.includes('think'))
  // earlier requests (preload) still carry the off switch
  for (const r of captured.slice(0, -1)) {
    assert.deepEqual(r.body.chat_template_kwargs, { enable_thinking: false })
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Point env at throwaway dirs BEFORE requiring anything that reads it.
const dir = mkdtempSync(join(tmpdir(), 'fractal-model-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
process.env.LLM_DATA_PATH = join(dir, 'LLM')
mkdirSync(process.env.LLM_DATA_PATH!)

writeFileSync(join(process.env.LLM_DATA_PATH!, 'prompt.txt'), 'You are Chucha.\n')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: db } = require('../src/utils/db/db') as typeof import('../src/utils/db/db')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const conversationStore = (require('../src/utils/db/conversationStore') as typeof import('../src/utils/db/conversationStore')).default

db.$client.exec(`CREATE TABLE IF NOT EXISTS \`conversationTurn\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`threadId\` text NOT NULL,
  \`messageId\` text,
  \`role\` text NOT NULL,
  \`content\` text NOT NULL,
  \`createdAt\` text DEFAULT (current_timestamp) NOT NULL
); CREATE UNIQUE INDEX IF NOT EXISTS \`conversationTurn_messageId_unique\` ON \`conversationTurn\` (\`messageId\`)`)

// Mock DailyRoll before anything loads getLogger — module-load loggers would otherwise
// open real SonicBoom file streams that keep the test process alive.
const dailyRollPath = require.resolve('../src/utils/logger/pino-daily-roll')
require.cache[dailyRollPath] = { id: dailyRollPath, filename: dailyRollPath, loaded: true, exports: () => ({ write: () => {}, flush: () => {}, end: () => {} }) } as any

// Mock fetch BEFORE Model is required — the constructor fires a preload call.
interface Captured { url: string, body: any }
let captured: Captured[] = []
type Responder = () => string | Promise<string>
let responder: Responder = () => 'preload'
;(globalThis as any).fetch = async (url: string, init: any) => {
  captured.push({ url, body: JSON.parse(init.body) })
  const content = await responder()
  return new Response(JSON.stringify({ content }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Model = (require('../src/utils/AI/Model') as typeof import('../src/utils/AI/Model')).default

function reset () {
  captured = []
  responder = () => 'preload'
  conversationStore.clearAll()
  for (const f of ['memory.txt', 'memoryTMP.txt', 'history.txt']) {
    try { rmSync(join(process.env.LLM_DATA_PATH!, f)) } catch {}
  }
}

// Let the constructor's preload call drain through the queue.
async function makeModel (): Promise<InstanceType<typeof Model>> {
  const model = new Model()
  await new Promise(r => setTimeout(r, 30))
  return model
}

test('prompt assembly: persona + memory section + recent conversation, ends with Chucha:', async () => {
  reset()
  const model = await makeModel()

  writeFileSync(join(process.env.LLM_DATA_PATH!, 'memory.txt'), 'Alice is a wizard.\n')
  conversationStore.addTurn('th1', 'm1', 'user', 'Alice: hi there')
  conversationStore.addTurn('th1', null, 'assistant', 'Chucha: hello alice')

  responder = () => 'hi back'
  const res = await model.chatWithChucha('th1')
  assert.equal(res, 'hi back')

  // last captured request is the real chat call (preload was first)
  const req = captured[captured.length - 1]
  assert.ok(req.url.endsWith('/completion'))
  assert.ok(req.body.prompt.includes('You are Chucha.'))
  assert.ok(req.body.prompt.includes('Long-term memory'), 'memory section present')
  assert.ok(req.body.prompt.includes('Alice is a wizard.'))
  assert.ok(req.body.prompt.includes('Recent conversation:'))
  const userIdx = req.body.prompt.indexOf('Alice: hi there')
  const asstIdx = req.body.prompt.indexOf('Chucha: hello alice')
  assert.ok(userIdx > -1 && asstIdx > userIdx, 'turns in order')
  assert.ok(req.body.prompt.trimEnd().endsWith('Chucha:'), 'prompt ends with Chucha:')
})

test('history.txt audit log gets input/output pair', async () => {
  reset()
  const model = await makeModel()

  conversationStore.addTurn('th2', 'm10', 'user', 'Bob: what is up')
  responder = () => 'not much'
  await model.chatWithChucha('th2')

  const history = readFileSync(join(process.env.LLM_DATA_PATH!, 'history.txt'), 'utf8')
  assert.ok(history.includes('Bob: what is up'))
  assert.ok(history.includes('Chucha:not much'))
})

test('concurrent calls are serialized (no overlapping LLM requests)', async () => {
  reset()
  const model = await makeModel()

  let active = 0
  let maxActive = 0
  responder = () => {
    active++
    maxActive = Math.max(maxActive, active)
    return new Promise<string>(resolve => setTimeout(() => { active--; resolve('done') }, 20))
  }

  await Promise.all([model.chatWithChucha(), model.chatWithChucha()])
  assert.equal(maxActive, 1, 'only one LLM call in flight at a time')
})

test('consolidateMemory distills all threads into memory.txt and clears the DB', async () => {
  reset()
  const model = await makeModel()

  conversationStore.addTurn('a', 'm1', 'user', 'Alice: I love pizza')
  conversationStore.addTurn('b', 'm2', 'user', 'Bob: the weather is nice')

  responder = () => 'Alice loves pizza. Bob likes the weather.'
  await model.consolidateMemory()

  const memory = readFileSync(join(process.env.LLM_DATA_PATH!, 'memory.txt'), 'utf8')
  assert.ok(memory.includes('Alice loves pizza.'))
  assert.equal(conversationStore.getAllThreads().size, 0)
})

test('consolidateMemory is a no-op when the DB is empty', async () => {
  reset()
  const model = await makeModel()

  responder = () => { throw new Error('should not be called') }
  await model.consolidateMemory()
  assert.ok(!existsSync(join(process.env.LLM_DATA_PATH!, 'memory.txt')))
})

test('appendMemory auto-compresses when memory.txt exceeds the size limit', async () => {
  reset()
  const model = await makeModel()

  // Pre-fill memory.txt past the 10KB limit
  writeFileSync(join(process.env.LLM_DATA_PATH!, 'memory.txt'), 'x'.repeat(12_000) + '\n')

  responder = () => 'compressed notes here' // compressMemoryFile call
  await model.appendMemory('new fact: chucha is a bot')

  const memory = readFileSync(join(process.env.LLM_DATA_PATH!, 'memory.txt'), 'utf8')
  assert.ok(memory.includes('compressed notes here'))
  assert.ok(memory.includes('new fact: chucha is a bot'))
  assert.ok(!memory.includes('x'.repeat(100)), 'old bloated content gone')
})

test('appendMemory does not compress when under the limit', async () => {
  reset()
  const model = await makeModel()

  writeFileSync(join(process.env.LLM_DATA_PATH!, 'memory.txt'), 'old note\n')
  responder = () => { throw new Error('should not be called') }
  await model.appendMemory('another note')

  const memory = readFileSync(join(process.env.LLM_DATA_PATH!, 'memory.txt'), 'utf8')
  assert.ok(memory.includes('old note'))
  assert.ok(memory.includes('another note'))
})

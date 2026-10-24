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
  \`upvotes\` integer NOT NULL DEFAULT 0,
  \`downvotes\` integer NOT NULL DEFAULT 0,
  \`promoted\` integer NOT NULL DEFAULT 0,
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
// raw bodies served one-per-fetch (to simulate malformed/empty responses); falls back to {content: responder()}
let rawBodies: unknown[] = []
// Error-path overrides: per-fetch status queue + sticky status / raw body
let statuses: number[] = []
let forcedStatus: number | null = null
let forcedRawText: string | null = null
;(globalThis as any).fetch = async (url: string, init: any) => {
  captured.push({ url, body: JSON.parse(init.body) })
  const status = forcedStatus ?? (statuses.length > 0 ? statuses.shift()! : 200)
  const raw = forcedRawText ?? JSON.stringify(rawBodies.length > 0 ? rawBodies.shift()! : { content: await responder() })
  return new Response(raw, { status, headers: { 'Content-Type': 'application/json' } })
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Model = (require('../src/utils/AI/Model') as typeof import('../src/utils/AI/Model')).default
const { ensureLayout, dailyFile, warsawYmd, isoWeekKeyOfYmd, ymdsOfIsoWeek, weeklyFile } = require('../src/utils/AI/memoryPyramid') as typeof import('../src/utils/AI/memoryPyramid')

function reset () {
  captured = []
  responder = () => 'preload'
  rawBodies = []
  statuses = []
  forcedStatus = null
  forcedRawText = null
  conversationStore.clearAll()
  for (const f of ['memory.txt', 'history.txt']) {
    try { rmSync(join(process.env.LLM_DATA_PATH!, f)) } catch {}
  }
  try { rmSync(join(process.env.LLM_DATA_PATH!, 'memory'), { recursive: true, force: true }) } catch {}
}

// Let the constructor's preload call drain through the queue.
async function makeModel (): Promise<InstanceType<typeof Model>> {
  const model = new Model()
  await new Promise(resolve => setTimeout(resolve, 30))
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

test('consolidateMemory distills all threads into the current daily file and clears the DB', async () => {
  reset()
  const model = await makeModel()

  conversationStore.addTurn('a', 'm1', 'user', 'Alice: I love pizza')
  conversationStore.addTurn('b', 'm2', 'user', 'Bob: the weather is nice')

  responder = () => 'Alice loves pizza. Bob likes the weather.'
  await model.consolidateMemory()

  const memory = readFileSync(dailyFile(warsawYmd(new Date())), 'utf8')
  assert.ok(memory.includes('Alice loves pizza.'))
  assert.equal(conversationStore.getAllThreads().size, 0)
})

test('consolidateMemory is a no-op when the DB is empty', async () => {
  reset()
  const model = await makeModel()

  responder = () => { throw new Error('should not be called') }
  await model.consolidateMemory()
  assert.ok(!existsSync(dailyFile(warsawYmd(new Date()))))
})

test('consolidateMemory excludes downvoted answers from the transcript', async () => {
  reset()
  const model = await makeModel()

  conversationStore.addTurn('dv1', 'u1', 'user', 'Alice: what is up')
  conversationStore.addTurn('dv1', 'a1', 'assistant', 'Chucha: a bad answer')
  conversationStore.recordVote('a1', false, true) // 👎 → more down than up

  responder = () => 'notes'
  await model.consolidateMemory()

  const req = captured[captured.length - 1]
  assert.ok(req.body.prompt.includes('Alice: what is up'), 'question kept')
  assert.ok(!req.body.prompt.includes('Chucha: a bad answer'), 'downvoted answer excluded')
})

test('consolidateMemory distills highly-rated answers with a ⭐ marker and deletes all rows', async () => {
  reset()
  const model = await makeModel()

  conversationStore.addTurn('up1', 'u2', 'user', 'Bob: tell me a fact')
  conversationStore.addTurn('up1', 'a2', 'assistant', 'Chucha: great answer!')
  conversationStore.recordVote('a2', true, true) // 👍 → more up than down

  responder = () => 'great answer noted'
  await model.consolidateMemory()

  const req = captured[captured.length - 1]
  assert.ok(req.body.prompt.includes('⭐ highly-rated answer: Chucha: great answer!'), 'upvoted answer starred in the transcript')
  assert.ok(req.body.prompt.includes('Bob: tell me a fact'))

  const memory = readFileSync(dailyFile(warsawYmd(new Date())), 'utf8')
  assert.ok(memory.includes('great answer noted'))
  assert.equal(conversationStore.getAllThreads().size, 0, 'all rows deleted — the memory files are the archive')

  // second run: DB is empty → no LLM call
  const before = captured.length
  responder = () => { throw new Error('should not be called') }
  await model.consolidateMemory()
  assert.equal(captured.length, before, 'no LLM call when the DB is empty')
})

test('consolidateMemory distills leftover promoted rows (⭐) and deletes them', async () => {
  reset()
  const model = await makeModel()

  // Simulate leftovers from an earlier run: a row already flagged promoted
  conversationStore.addTurn('lp1', 'lu1', 'user', 'Alice: what was that fact?')
  conversationStore.addTurn('lp1', 'la1', 'assistant', 'Chucha: the archived gem')
  conversationStore.markPromoted(['la1'])

  responder = () => 'gem distilled'
  await model.consolidateMemory()

  const req = captured[captured.length - 1]
  assert.ok(req.body.prompt.includes('⭐ highly-rated answer: Chucha: the archived gem'), 'promoted leftover starred')
  assert.equal(conversationStore.getAllThreads().size, 0, 'promoted row deleted after distillation')
})

test('consolidateMemory LLM failure leaves DB un-cleared, memory untouched, queue usable', async () => {
  reset()
  const model = await makeModel()

  conversationStore.addTurn('f1', 'fm1', 'user', 'Alice: important fact')

  responder = () => { throw new Error('LLM down') }
  await assert.rejects(() => model.consolidateMemory())

  assert.equal(conversationStore.getAllThreads().size, 1, 'rows survive the failed run')
  assert.ok(!existsSync(dailyFile(warsawYmd(new Date()))), 'no memory written on failure')

  // the single-flight queue is not wedged — the next run works
  responder = () => 'recovered notes'
  await model.consolidateMemory()
  assert.ok(readFileSync(dailyFile(warsawYmd(new Date())), 'utf8').includes('recovered notes'))
})

function allRows (): any[] {
  let rows: any[] = []
  for (const r of conversationStore.getAllThreads().values()) rows = rows.concat(r)
  return rows
}

test('consolidateMemory: tied votes (1 up / 1 down) are distilled, not promoted', async () => {
  reset()
  const model = await makeModel()

  conversationStore.addTurn('tie1', 'tu1', 'user', 'Alice: question?')
  conversationStore.addTurn('tie1', 'ta1', 'assistant', 'Chucha: a decent answer')
  conversationStore.recordVote('ta1', true, true)  // 1 up
  conversationStore.recordVote('ta1', false, true) // 1 down → tie

  responder = () => 'tie noted'
  await model.consolidateMemory()

  const req = captured[captured.length - 1]
  assert.ok(req.body.prompt.includes('Chucha: a decent answer'), 'tied answer distilled into transcript')
  assert.equal(allRows().length, 0, 'tied row cleared, not promoted (needs strictly more up than down)')
})

test('consolidateMemory: zero-vote answers are distilled, not promoted', async () => {
  reset()
  const model = await makeModel()

  conversationStore.addTurn('z1', 'zu1', 'user', 'Bob: hello')
  conversationStore.addTurn('z1', 'za1', 'assistant', 'Chucha: hi bob')

  responder = () => 'hello noted'
  await model.consolidateMemory()

  const req = captured[captured.length - 1]
  assert.ok(req.body.prompt.includes('Chucha: hi bob'), 'zero-vote answer distilled')
  assert.equal(conversationStore.getAllThreads().size, 0, 'all rows cleared; nothing promoted')
})

test('promoted rows are excluded from the live chat prompt', async () => {
  reset()
  const model = await makeModel()

  conversationStore.addTurn('pp1', 'pu1', 'user', 'Alice: question')
  conversationStore.addTurn('pp1', 'pa1', 'assistant', 'Chucha: archived gem')
  conversationStore.markPromoted(['pa1'])
  conversationStore.addTurn('pp1', 'pu2', 'user', 'Alice: follow-up')

  responder = () => 'ok'
  await model.chatWithChucha('pp1')

  const req = captured[captured.length - 1]
  assert.ok(req.body.prompt.includes('Alice: follow-up'))
  assert.ok(!req.body.prompt.includes('Chucha: archived gem'), 'promoted row not in live prompt')
})

test('appendMemory appends to the current daily file without an LLM call', async () => {
  reset()
  const model = await makeModel()

  const ymd = warsawYmd(new Date())
  ensureLayout()
  writeFileSync(dailyFile(ymd), 'old note\n')
  responder = () => { throw new Error('should not be called') }
  await model.appendMemory('another note')

  const memory = readFileSync(dailyFile(ymd), 'utf8')
  assert.ok(memory.includes('old note'))
  assert.ok(memory.includes('another note'))
})

test('promoteMemory merges a complete week of dailies into the weekly file and deletes them', async () => {
  reset()
  const model = await makeModel()

  // A week that is fully in the past: the one containing "14 days ago" (always complete).
  const past = new Date()
  past.setDate(past.getDate() - 14)
  const wk = isoWeekKeyOfYmd(warsawYmd(past))
  const days = ymdsOfIsoWeek(wk)
  ensureLayout()
  for (const d of days) writeFileSync(dailyFile(d), `fact from ${d}\n`)

  responder = () => 'merged week: all facts kept'
  await model.promoteMemory()

  assert.ok(existsSync(weeklyFile(wk)), 'weekly file written')
  assert.ok(readFileSync(weeklyFile(wk), 'utf8').includes('merged week: all facts kept'))
  for (const d of days) assert.ok(!existsSync(dailyFile(d)), `daily ${d} deleted after merge`)
})

test('promoteMemory LLM failure keeps the input dailies (retried on the next run)', async () => {
  reset()
  const model = await makeModel()

  const past = new Date()
  past.setDate(past.getDate() - 14)
  const wk = isoWeekKeyOfYmd(warsawYmd(past))
  const days = ymdsOfIsoWeek(wk)
  ensureLayout()
  for (const d of days) writeFileSync(dailyFile(d), `fact from ${d}\n`)

  responder = () => { throw new Error('LLM down') }
  await assert.rejects(() => model.promoteMemory())
  for (const d of days) assert.ok(existsSync(dailyFile(d)), `daily ${d} survives the failed merge`)
  assert.ok(!existsSync(weeklyFile(wk)), 'no weekly file on failure')
})

test('stop array always includes the thinking tags', async () => {
  reset()
  const model = await makeModel()

  responder = () => 'ok'
  await model.chatWithChucha()

  const req = captured[captured.length - 1]
  assert.ok(req.body.stop.includes('<think>'))
  assert.ok(req.body.stop.includes('</think>'))
})

test('empty responses are retried until a non-empty one arrives', async () => {
  reset()
  const model = await makeModel()

  // first two attempts come back empty/whitespace, third succeeds
  rawBodies = [{ content: '' }, { content: '   ' }]
  responder = () => 'finally here'
  assert.equal(await model.chatWithChucha(), 'finally here')
  // preload (1) + 3 attempts
  assert.equal(captured.length, 4)
})

test('response without content field is retried then throws', async () => {
  reset()
  const model = await makeModel()

  // simulate llama.cpp returning 200 with an unexpected body (no content key) on every attempt
  rawBodies = [
    { error: 'model not loaded' },
    { error: 'model not loaded' },
    { error: 'model not loaded' },
    { error: 'model not loaded' },
    { error: 'model not loaded' },
  ]
  await assert.rejects(model.chatWithChucha(), /empty response after 5 attempts/)
})

test('HTTP errors are retried and recover once the server responds', async () => {
  reset()
  const model = await makeModel()

  statuses = [500, 500]
  responder = () => 'recovered'
  assert.equal(await model.chatWithChucha(), 'recovered')
  // preload + 2 failed attempts + success
  assert.equal(captured.length, 4)
})

test('persistent HTTP errors reject after 5 attempts and the queue stays usable', async () => {
  reset()
  const model = await makeModel()

  forcedStatus = 500
  responder = () => 'unreachable'
  await assert.rejects(model.chatWithChucha(), /request failed after 5 attempts/)

  forcedStatus = null
  responder = () => 'back online'
  assert.equal(await model.chatWithChucha(), 'back online')
})

test('non-JSON response body is retried then throws, queue stays usable', async () => {
  reset()
  const model = await makeModel()

  forcedRawText = '<html>gateway error</html>'
  await assert.rejects(model.chatWithChucha(), /request failed after 5 attempts/)

  forcedRawText = null
  responder = () => 'json again'
  assert.equal(await model.chatWithChucha(), 'json again')
})

test('llama mode (default) posts to /completion with llama.cpp payload shape', async () => {
  reset()
  rawBodies = [{ content: 'from llama.cpp' }]
  const model = await makeModel()

  await model.chatWithChucha()

  const req = captured[captured.length - 1]
  assert.ok(req.url.endsWith('/completion'), `expected /completion, got ${req.url}`)
  assert.ok('n_predict' in req.body, 'llama.cpp field present')
  assert.ok(!('max_tokens' in req.body), 'openai field must not leak into llama payload')
  assert.equal(req.body.repeat_penalty, 2.0)
})

test('backend factory: llama mode selects TextCompletionBackend', async () => {
  reset()
  process.env.LLM_MODE = 'llama'
  const factory = require('../src/utils/AI/backendFactory')
  const backend = factory.createBackend()

  // TextCompletionBackend has an 'openai' property; ChatCompletionBackend does not
  assert.ok('openai' in backend, 'llama mode selects TextCompletionBackend')
})

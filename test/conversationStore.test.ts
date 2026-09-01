import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Point env at a throwaway DB BEFORE requiring anything that reads it.
const dir = mkdtempSync(join(tmpdir(), 'fractal-test-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: db } = require('../src/utils/db/db') as typeof import('../src/utils/db/db')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const conversationStore = (require('../src/utils/db/conversationStore') as typeof import('../src/utils/db/conversationStore')).default

// Same DDL as migration 0003 — keeps the test independent of drizzle-kit state.
db.$client.exec(`CREATE TABLE IF NOT EXISTS \`conversationTurn\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`threadId\` text NOT NULL,
  \`messageId\` text,
  \`role\` text NOT NULL,
  \`content\` text NOT NULL,
  \`createdAt\` text DEFAULT (current_timestamp) NOT NULL
); CREATE UNIQUE INDEX IF NOT EXISTS \`conversationTurn_messageId_unique\` ON \`conversationTurn\` (\`messageId\`)`)

after(() => {
  db.$client.close()
  rmSync(dir, { recursive: true, force: true })
})

test('addTurn stores a turn and getThread returns it in insertion order', () => {
  conversationStore.addTurn('t1', 'm1', 'user', 'Alice: hi')
  conversationStore.addTurn('t1', null, 'assistant', 'Chucha: hello')
  const turns = conversationStore.getThread('t1')
  assert.equal(turns.length, 2)
  assert.deepEqual(turns[0], { messageId: 'm1', role: 'user', content: 'Alice: hi' })
  assert.deepEqual(turns[1], { messageId: null, role: 'assistant', content: 'Chucha: hello' })
})

test('addTurn dedupes by messageId (no duplicate rows)', () => {
  conversationStore.addTurn('t2', 'm9', 'user', 'Bob: first')
  conversationStore.addTurn('t2', 'm9', 'user', 'Bob: first again') // same messageId → no-op
  assert.equal(conversationStore.getThread('t2').length, 1)
})

test('turns without messageId are always inserted (Chucha replies before send)', () => {
  conversationStore.addTurn('t3', null, 'assistant', 'Chucha: a')
  conversationStore.addTurn('t3', null, 'assistant', 'Chucha: b')
  assert.equal(conversationStore.getThread('t3').length, 2)
})

test('getThread returns empty for unknown threads', () => {
  assert.deepEqual(conversationStore.getThread('nonexistent-thread'), [])
})

test('getAllThreads groups turns per thread', () => {
  const all = conversationStore.getAllThreads()
  assert.ok(all.has('t1'))
  assert.equal(all.get('t1')!.length, 2)
  assert.ok(!all.has('nope'))
})

test('clearThread removes only that thread; clearAll wipes everything', () => {
  const cleared = conversationStore.clearThread('t3')
  assert.equal(cleared, 2)
  assert.deepEqual(conversationStore.getThread('t3'), [])
  assert.ok(conversationStore.getAllThreads().has('t1'))

  const total = conversationStore.clearAll()
  assert.ok(total >= 3) // t1(2) + t2(1); t3 already cleared
  assert.equal(conversationStore.getAllThreads().size, 0)
})

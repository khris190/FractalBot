import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Point env at throwaway dirs BEFORE requiring anything that reads it.
const dir = mkdtempSync(join(tmpdir(), 'fractal-prompt-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
process.env.LLM_DATA_PATH = join(dir, 'LLM')
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

const conversationStore = (require('../src/utils/db/conversationStore') as typeof import('../src/utils/db/conversationStore')).default
const prompt = require('../src/utils/AI/prompt') as typeof import('../src/utils/AI/prompt')

const reset = () => conversationStore.clearAll()

test('loadToday is empty when the store is empty', () => {
  reset()
  assert.equal(prompt.loadToday(), '')
})

test('loadToday is chronological across threads, newest last', () => {
  reset()
  conversationStore.addTurn('t1', 'm1', 'user', 'a: first')
  conversationStore.addTurn('t2', 'm2', 'user', 'b: second')
  conversationStore.addTurn('t1', 'm3', 'assistant', 'Chucha: third')

  assert.equal(prompt.loadToday(), '\nToday so far:\na: first\nb: second\nChucha: third\n')
})

test('loadToday excludes the given thread', () => {
  reset()
  conversationStore.addTurn('t1', 'm1', 'user', 'a: mine')
  conversationStore.addTurn('t2', 'm2', 'user', 'b: yours')

  assert.equal(prompt.loadToday('t1'), '\nToday so far:\nb: yours\n')
})

test('loadToday tail-trims past the byte budget, keeping the newest', () => {
  reset()
  const big = 'x'.repeat(2000)
  for (let i = 0; i < 8; i++) conversationStore.addTurn('t', `p${i}`, 'user', `u${i}: ${big}`)

  const out = prompt.loadToday()
  assert.ok(Buffer.byteLength(out) <= prompt.TODAY_PROMPT_MAX_BYTES + 50, 'within budget')
  assert.ok(out.includes('u7:'), 'newest kept')
  assert.ok(!out.includes('u0:'), 'oldest dropped')
})

test('buildPrompt embeds the today section and omits it when empty', () => {
  reset()
  assert.ok(!prompt.buildPrompt('t1').includes('Today so far'), 'no section on empty store')

  conversationStore.addTurn('t1', 'm1', 'user', 'a: hello')
  conversationStore.addTurn('t2', 'm2', 'user', 'b: other')
  const p = prompt.buildPrompt('t1')
  assert.ok(p.includes('Today so far'), 'section present when other threads have rows')
  assert.ok(p.includes('b: other'), 'other threads are in the raw log')
  // the current thread is already the recent conversation — exactly one copy, no duplication
  assert.equal((p.match(/a: hello/g) ?? []).length, 1)
})

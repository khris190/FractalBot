import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Point env at throwaway dirs BEFORE requiring anything that reads it.
const dir = mkdtempSync(join(tmpdir(), 'fractal-handler-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
// the handler instantiates a real Model at module load — give it a stub prompt file
process.env.LLM_DATA_PATH = join(dir, 'LLM')
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const conversationStore = (require('../src/utils/db/conversationStore') as typeof import('../src/utils/db/conversationStore')).default

// Stub fetch before module load: the handler's real Model fires a preload call on construction
;(globalThis as any).fetch = async () => new Response(JSON.stringify({ content: '' }), { status: 200, headers: { 'Content-Type': 'application/json' } })

// Mock DailyRoll BEFORE anything loads getLogger — the handler's module-load loggers would
// otherwise open real SonicBoom file streams that keep the test process alive.
const dailyRollPath = require.resolve('../src/utils/logger/pino-daily-roll')
require.cache[dailyRollPath] = { id: dailyRollPath, filename: dailyRollPath, loaded: true, exports: () => ({ write: () => {}, flush: () => {}, end: () => {} }) } as any

// Mock Client BEFORE requiring the handler — no real Discord client in tests.
const BOT_ID = '100'
require.cache[require.resolve('../src/Client')] = {
  id: 'mock-client', filename: 'mock-client', loaded: true,
  exports: { default: { client: { user: { id: BOT_ID, displayName: 'Chucha' } } }, __esModule: true },
} as any

// Mock ReplyHelper — records replies instead of sleeping/sending.
const replied: Array<{ type: number, content?: string }> = []
require.cache[require.resolve('../src/utils/ReplyHelper')] = {
  id: 'mock-replyhelper', filename: 'mock-replyhelper', loaded: true,
  exports: {
    default: { respond: (_msg: any, type: number, payload: any) => replied.push({ type, content: payload.content }) },
    ResponseType: { REPLY: 0, SAME_CHANNEL: 1, DELAY_REPLY: 2, DELAY_SAME_CHANNEL: 3 },
    __esModule: true,
  },
} as any

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LLMPingResponseHandler = (require('../src/responses/LLMPingResponseHandler') as typeof import('../src/responses/LLMPingResponseHandler')).default
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { settings } = require('../src/settings')

let chatCalls: string[] = []
;(LLMPingResponseHandler as any).model = {
  busy: false,
  chatWithChucha: (threadId?: string) => { chatCalls.push(threadId ?? ''); return Promise.resolve('mock reply') },
}

interface FakeMsg {
  id: string; author: { id: string, displayName: string }; content: string; cleanContent: string
  mentions: { users: any[] }; reference?: { messageId: string } | null
  channel: any; reply: (payload: any) => Promise<{ id: string, react?: (e: string) => Promise<void> }>
}

const parents: Record<string, FakeMsg> = {}
function makeMessage (opts: { id: string, authorId: string, content: string, mentionChucha?: boolean, parentIds?: string[], replyTo?: (p: any) => Promise<{ id: string }>, sendTyping?: () => void }): FakeMsg {
  const channel = { messages: { fetch: async (id: string) => parents[id] }, sendTyping: opts.sendTyping ?? (() => {}) }
  return {
    id: opts.id,
    author: { id: opts.authorId, displayName: opts.authorId === BOT_ID ? 'Chucha' : `user-${opts.authorId}` },
    content: opts.content,
    cleanContent: opts.content.replace(/<@\d+>/g, '@Chucha'),
    mentions: { users: opts.mentionChucha ? [{ id: BOT_ID }] : [] },
    reference: opts.parentIds?.length ? { messageId: opts.parentIds[0] } : null,
    channel,
    // default sent-message exposes a no-op react so the handler's seeding doesn't error
    reply: opts.replyTo ?? (async () => ({ id: `sent-${opts.id}`, react: async () => {} })),
  }
}

// ids[0] is the root; each next message references the previous one
function setupChain (ids: string[], authorId: string) {
  for (let i = 0; i < ids.length; i++) {
    parents[ids[i]] = makeMessage({ id: ids[i], authorId, content: `msg ${i}`, parentIds: i > 0 ? [ids[i - 1]] : [] })
  }
}

function reset () {
  chatCalls = []
  replied.length = 0
  ;(LLMPingResponseHandler as any).model.busy = false
  conversationStore.clearAll()
  for (const k of Object.keys(parents)) delete parents[k]
}

test('prepareThread walks the reference chain and stores each turn once, keyed by root id', async () => {
  reset()
  setupChain(['root1', 'mid1', 'new1'], '200')
  const msg = makeMessage({ id: 'new1', authorId: '200', content: 'msg 2', mentionChucha: true, parentIds: ['mid1'] })

  const threadId = await (LLMPingResponseHandler as any).prepareThread(msg)
  assert.equal(threadId, 'root1')

  const turns = conversationStore.getThread('root1')
  assert.deepEqual(turns.map(t => t.content), ['user-200: msg 0', 'user-200: msg 1', 'user-200: msg 2'])
  assert.ok(turns.every(t => t.role === 'user'))
})

test('prepareThread is idempotent — re-walking the chain adds no duplicate rows', async () => {
  reset()
  setupChain(['root2', 'new2'], '300')
  const msg = makeMessage({ id: 'new2', authorId: '300', content: 'msg 1', mentionChucha: true, parentIds: ['root2'] })

  await (LLMPingResponseHandler as any).prepareThread(msg)
  await (LLMPingResponseHandler as any).prepareThread(msg) // second walk must be a no-op
  assert.equal(conversationStore.getThread('root2').length, 2)
})

test('_handle returns false when the model is busy', async () => {
  reset()
  const msg = makeMessage({ id: 'a3', authorId: '400', content: '<@100> hi', mentionChucha: true })
  ;(LLMPingResponseHandler as any).model.busy = true

  assert.equal(await LLMPingResponseHandler.handleMessage(msg as any), false)
  assert.deepEqual(chatCalls, [])
})

test('_handle returns false when Chucha is not mentioned', async () => {
  reset()
  const msg = makeMessage({ id: 'b1', authorId: '400', content: 'hello world' })
  assert.equal(await LLMPingResponseHandler.handleMessage(msg as any), false)
})

test('admin ping replies and stores Chucha turn with the real reply messageId', async () => {
  reset()
  const sentIds: string[] = []
  const msg = makeMessage({
    id: 'c1', authorId: settings.ADMINS[0], content: '<@100> what is up', mentionChucha: true,
    replyTo: async () => { const id = `sent-${Date.now()}`; sentIds.push(id); return { id } },
  })

  assert.equal(await LLMPingResponseHandler.handleMessage(msg as any), true)
  assert.deepEqual(chatCalls, ['c1']) // the ping itself is the thread root

  const turns = conversationStore.getThread('c1')
  assert.ok(turns.some(t => t.role === 'assistant' && t.content === 'Chucha: mock reply'))
  // user turn keyed by its own id; assistant turn keyed by the sent reply's real id
  assert.deepEqual(turns.filter(t => t.messageId).map(t => t.messageId), ['c1', sentIds[0]])
})

test('second non-admin ping within cooldown gets the cooldown message, no extra LLM call', async () => {
  reset()
  const mk = (id: string) => makeMessage({ id, authorId: '999', content: '<@100> hi', mentionChucha: true })

  assert.equal(await LLMPingResponseHandler.handleMessage(mk('d1') as any), true) // first ping passes cooldown
  assert.deepEqual(chatCalls, ['d1'])

  assert.equal(await LLMPingResponseHandler.handleMessage(mk('d2') as any), true) // within 60s → cooldown msg
  assert.deepEqual(chatCalls, ['d1'], 'no second LLM call')
  const last = replied[replied.length - 1]
  assert.ok(last.content!.includes('pipe down'), 'cooldown message sent')
})

test('LLM errors produce the fallback error reply', async () => {
  reset()
  ;(LLMPingResponseHandler as any).model.chatWithChucha = () => Promise.reject(new Error('boom'))
  const msg = makeMessage({ id: 'e1', authorId: settings.ADMINS[0], content: '<@100> hi', mentionChucha: true })

  assert.equal(await LLMPingResponseHandler.handleMessage(msg as any), true)
  const last = replied[replied.length - 1]
  assert.ok(last.content!.includes('idiot of a creator'))
})

test('Chucha replies are seeded with 👍 and 👎 reactions', async () => {
  reset()
  ;(LLMPingResponseHandler as any).model.chatWithChucha = (threadId?: string) => { chatCalls.push(threadId ?? ''); return Promise.resolve('rate me') }
  const reacted: string[] = []
  const msg = makeMessage({
    id: 'f1', authorId: settings.ADMINS[0], content: '<@100> hi', mentionChucha: true,
    replyTo: async () => ({ id: 'sent-f1', react: async (e: string) => { reacted.push(e); return {} } }),
  })

  assert.equal(await LLMPingResponseHandler.handleMessage(msg as any), true)
  assert.ok(reacted.includes('👍'), 'thumbs-up seeded')
  assert.ok(reacted.includes('👎'), 'thumbs-down seeded')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'

// Mock LLMPingResponseHandler BEFORE requiring the interval — the real handler
// instantiates a Model (firing a preload LLM call) at module load.
const handlerPath = require.resolve('../src/responses/LLMPingResponseHandler')
const handlerModule = { default: { model: null as any }, __esModule: true }
require.cache[handlerPath] = { id: handlerPath, filename: handlerPath, loaded: true, exports: handlerModule } as any

// Mock Client BEFORE requiring the interval — the interval's status helper would otherwise
// load the real Discord client + file loggers.
const activities: string[] = []
require.cache[require.resolve('../src/Client')] = {
  id: 'mock-client', filename: 'mock-client', loaded: true,
  exports: { default: { client: { user: { id: '100', displayName: 'Chucha', setActivity: (a: string) => activities.push(a) } } }, __esModule: true },
} as any

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: interval } = require('../src/intervals/MemoryConsolidation') as typeof import('../src/intervals/MemoryConsolidation')

interface ModelStub {
  busy: boolean
  calls: number
  promoteCalls: number
  failWith?: Error
  promoteFailWith?: Error
  consolidateMemory (): Promise<void>
  promoteMemory (): Promise<void>
}

function makeStub (): ModelStub {
  const stub: ModelStub = {
    busy: false,
    calls: 0,
    promoteCalls: 0,
    consolidateMemory: async () => {
      stub.calls++
      if (stub.failWith) throw stub.failWith
    },
    promoteMemory: async () => {
      stub.promoteCalls++
      if (stub.promoteFailWith) throw stub.promoteFailWith
    },
  }
  return stub
}

function makeLogger () {
  const entries: Array<{ level: string, msg: string, err?: Error }> = []
  const log = (level: string) => (msg: string, obj?: object) =>
    entries.push({ level, msg, err: obj instanceof Error ? obj : undefined })
  return {
    entries,
    debug: log('debug'),
    error: log('error'),
    fatal: log('fatal'),
    info: log('info'),
    notice: log('notice'),
    trace: log('trace'),
    warn: log('warn'),
  }
}

// Fixed winter-2026 dates: Warsaw is UTC+1, so 04:00Z = 05:00 Warsaw.
const W0500 = new Date('2026-01-02T04:00:00Z')
const W0501 = new Date('2026-01-02T04:01:00Z')
const W1200 = new Date('2026-01-02T11:00:00Z')
const WNEXT = new Date('2026-01-03T04:00:00Z')

function setup (lastRunDate = '2026-01-01') {
  const stub = makeStub()
  handlerModule.default.model = stub
  const logger = makeLogger()
  interval.lastRunDate = lastRunDate
  return { stub, logger }
}

test('fires consolidateMemory exactly at 05:00 Warsaw', async () => {
  const { stub, logger } = setup()
  await interval.run({} as any, logger, W0500)
  assert.equal(stub.calls, 1)
  assert.equal(stub.promoteCalls, 1, 'promotion pass runs after consolidation')
  assert.equal(interval.lastRunDate, '2026-01-02')
  assert.ok(logger.entries.some(e => e.level === 'info' && /starting/.test(e.msg)))
})

test('reports dreaming activity while consolidating, idle after', async () => {
  const { stub, logger } = setup()
  activities.length = 0
  await interval.run({} as any, logger, W0500)
  assert.deepEqual(activities, ['🌙 dreaming', 'Balala'])
})

test('does nothing off-target (05:01)', async () => {
  const { stub, logger } = setup()
  await interval.run({} as any, logger, W0501)
  assert.equal(stub.calls, 0)
  assert.equal(stub.promoteCalls, 0)
  assert.equal(interval.lastRunDate, '2026-01-01')
})

test('fires once per Warsaw day', async () => {
  const { stub, logger } = setup()
  await interval.run({} as any, logger, W0500)
  await interval.run({} as any, logger, W1200) // later the same day
  assert.equal(stub.calls, 1)
  assert.equal(stub.promoteCalls, 1)
})

test('fires again the next Warsaw day', async () => {
  const { stub, logger } = setup()
  await interval.run({} as any, logger, W0500)
  await interval.run({} as any, logger, WNEXT)
  assert.equal(stub.calls, 2)
  assert.equal(interval.lastRunDate, '2026-01-03')
})

test('skips the boot day', async () => {
  const { stub, logger } = setup('2026-01-02') // lastRunDate == Warsaw today at boot
  await interval.run({} as any, logger, W0500)
  assert.equal(stub.calls, 0)
  assert.equal(stub.promoteCalls, 0)
})

test('calls consolidateMemory even when model.busy (the Model queue serializes)', async () => {
  const { stub, logger } = setup()
  stub.busy = true // never frees up — the interval must not wait on it
  await interval.run({} as any, logger, W0500)
  assert.equal(stub.calls, 1)
  assert.equal(stub.promoteCalls, 1)
})

test('logs consolidation errors without throwing', async () => {
  const { stub, logger } = setup()
  stub.failWith = new Error('boom')
  await interval.run({} as any, logger, W0500)
  const err = logger.entries.find(e => e.level === 'error')
  assert.ok(err && /consolidation failed/.test(err.msg) && err.err?.message === 'boom')
  assert.equal(stub.promoteCalls, 0, 'promotion skipped when consolidation failed')
})

test('logs promotion errors without throwing', async () => {
  const { stub, logger } = setup()
  stub.promoteFailWith = new Error('merge boom')
  await interval.run({} as any, logger, W0500)
  assert.equal(stub.calls, 1, 'consolidation ran first')
  assert.equal(stub.promoteCalls, 1)
  const err = logger.entries.find(e => e.level === 'error')
  assert.ok(err && /consolidation failed/.test(err.msg) && err.err?.message === 'merge boom')
})

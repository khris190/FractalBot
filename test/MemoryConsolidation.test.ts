import { test } from 'node:test'
import assert from 'node:assert/strict'

// Mock LLMPingResponseHandler BEFORE requiring the interval — the real handler
// instantiates a Model (firing a preload LLM call) at module load.
const handlerPath = require.resolve('../src/responses/LLMPingResponseHandler')
const handlerModule = { default: { model: null as any }, __esModule: true }
require.cache[handlerPath] = { id: handlerPath, filename: handlerPath, loaded: true, exports: handlerModule } as any

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: interval } = require('../src/intervals/MemoryConsolidation') as typeof import('../src/intervals/MemoryConsolidation')

interface ModelStub {
  busy: boolean
  calls: number
  failWith?: Error
  consolidateMemory (): Promise<void>
}

function makeStub (): ModelStub {
  const stub: ModelStub = {
    busy: false,
    calls: 0,
    consolidateMemory: async () => {
      stub.calls++
      if (stub.failWith) throw stub.failWith
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
    debug: log('debug'), error: log('error'), fatal: log('fatal'),
    info: log('info'), notice: log('notice'), trace: log('trace'), warn: log('warn'),
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
  assert.equal(interval.lastRunDate, '2026-01-02')
  assert.ok(logger.entries.some(e => e.level === 'info' && /starting/.test(e.msg)))
})

test('does nothing off-target (05:01)', async () => {
  const { stub, logger } = setup()
  await interval.run({} as any, logger, W0501)
  assert.equal(stub.calls, 0)
  assert.equal(interval.lastRunDate, '2026-01-01')
})

test('fires once per Warsaw day', async () => {
  const { stub, logger } = setup()
  await interval.run({} as any, logger, W0500)
  await interval.run({} as any, logger, W1200) // later the same day
  assert.equal(stub.calls, 1)
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
})

test('calls consolidateMemory even when model.busy (the Model queue serializes)', async () => {
  const { stub, logger } = setup()
  stub.busy = true // never frees up — the interval must not wait on it
  await interval.run({} as any, logger, W0500)
  assert.equal(stub.calls, 1)
})

test('logs consolidation errors without throwing', async () => {
  const { stub, logger } = setup()
  stub.failWith = new Error('boom')
  await interval.run({} as any, logger, W0500)
  const err = logger.entries.find(e => e.level === 'error')
  assert.ok(err && /consolidation failed/.test(err.msg) && err.err?.message === 'boom')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'

// Mock Client BEFORE requiring status — no real Discord client or file loggers in tests.
const activities: string[] = []
require.cache[require.resolve('../src/Client')] = {
  id: 'mock-client',
  filename: 'mock-client',
  loaded: true,
  exports: { default: { client: { user: { setActivity: (a: string) => activities.push(a) } } }, __esModule: true },
} as any

const { status } = require('../src/utils/status') as typeof import('../src/utils/status')

test('dreaming wins over answering and holds until the last one ends', () => {
  status.beginAnswering()
  status.beginDreaming()
  assert.equal(activities[activities.length - 1], '🌙 dreaming', 'dreaming masks answering')
  status.endAnswering()
  assert.equal(activities[activities.length - 1], '🌙 dreaming', 'answering done, still dreaming')
  status.endDreaming()
  assert.equal(activities[activities.length - 1], 'Balala', 'idle once the last run ends')
})

test('concurrent answers keep answering until the last one ends', () => {
  status.beginAnswering()
  status.beginAnswering()
  status.endAnswering()
  assert.equal(activities[activities.length - 1], '💬 answering')
  status.endAnswering()
  assert.equal(activities[activities.length - 1], 'Balala')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
delete process.env.SIMILARITY_ENDPOINT
delete process.env.SIMILARITY_THRESHOLD
delete process.env.SIMILARITY_TRESHOLD

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SimilarityChecker = (require('../src/utils/SimilarityChecker') as typeof import('../src/utils/SimilarityChecker')).default
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: env } = require('../src/utils/env')

interface Captured { url: string, body: any }
let captured: Captured[] = []
let nextStatus = 200
let nextJson: unknown = 0.5

;(globalThis as any).fetch = async (url: string, init: any) => {
  captured.push({ url, body: JSON.parse(init.body) })
  return new Response(JSON.stringify(nextJson), { status: nextStatus, headers: { 'Content-Type': 'application/json' } })
}

function makeChecker () {
  // saveToFile=false to avoid writing log files in tests
  const { default: getLogger } = require('../src/utils/logger/getLogger')
  return new SimilarityChecker(getLogger('test-sim', false))
}

// checkSimilarity resolves true when similarity is BELOW the threshold (wish is "new")
test('sends sentence + misspelled treshold wire key; low similarity → true (new wish)', async () => {
  captured = []
  nextStatus = 200
  nextJson = 0.5 // below default 0.9
  const checker = makeChecker()

  assert.equal(await checker.checkSimilarity('I wish for pizza'), true)

  assert.ok(captured[0].url === 'localhost:5000', 'default endpoint used')
  // wire contract with python/server.py — key MUST stay misspelled
  assert.deepEqual(captured[0].body, { sentence: 'I wish for pizza', treshold: env.SIMILARITY_THRESHOLD })
})

test('high similarity (above threshold) → false (duplicate)', async () => {
  nextJson = 0.95 // above default 0.9
  const checker = makeChecker()
  assert.equal(await checker.checkSimilarity('same wish again'), false)
})

test('network errors are swallowed and treated as duplicate (false)', async () => {
  nextStatus = 500
  const checker = makeChecker()
  assert.equal(await checker.checkSimilarity('whatever'), false)
})

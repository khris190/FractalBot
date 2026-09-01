import { test } from 'node:test'
import assert from 'node:assert/strict'

// Prevent .env from being loaded in this process so defaults are deterministic.
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'

const KEYS = ['TOKEN', 'CLIENT_ID', 'GUILD_ID', 'DATA_PATH', 'LOG_PATH', 'DB_FILE', 'SIMILARITY_ENDPOINT', 'SIMILARITY_THRESHOLD', 'SIMILARITY_TRESHOLD', 'LLM_ENDPOINT', 'LLM_DATA_PATH'] as const

function loadEnv (overrides: Record<string, string> = {}) {
  delete require.cache[require.resolve('../src/utils/env')]
  for (const k of KEYS) delete process.env[k]
  Object.assign(process.env, overrides)
  return require('../src/utils/env').default
}

test('defaults when nothing is set', () => {
  const env = loadEnv()
  assert.equal(env.DATA_PATH, './data')
  // DB_FILE is internal (not exported) — verify via the resolved DB_PATH
  assert.ok(env.DB_PATH.endsWith('db.sqlite'))
  assert.equal(env.SIMILARITY_ENDPOINT, 'localhost:5000')
  assert.equal(env.LLM_ENDPOINT, 'localhost:8080')
  assert.equal(env.SIMILARITY_THRESHOLD, 0.9)
  assert.equal(env.LLM_DATA_PATH, '/app/data/LLM')
})

test('misspelled SIMILARITY_TRESHOLD is accepted as fallback', () => {
  const env = loadEnv({ SIMILARITY_TRESHOLD: '0.7' })
  assert.equal(env.SIMILARITY_THRESHOLD, 0.7)
})

test('correctly spelled name wins over misspelled one', () => {
  const env = loadEnv({ SIMILARITY_THRESHOLD: '0.8', SIMILARITY_TRESHOLD: '0.7' })
  assert.equal(env.SIMILARITY_THRESHOLD, 0.8)
})

test('DB_PATH resolves DATA_PATH + DB_FILE', () => {
  const env = loadEnv({ DATA_PATH: '/tmp/somewhere', DB_FILE: 'x.sqlite' })
  assert.ok(env.DB_PATH.endsWith('/tmp/somewhere/x.sqlite'))
})

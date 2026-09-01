import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sleep, Defer } from '../src/utils/helpers'

test('sleep resolves after the given delay', async () => {
  const start = Date.now()
  await sleep(50)
  assert.ok(Date.now() - start >= 40) // allow timer slop
})

test('Defer resolves with a value', async () => {
  const d = new Defer<number>()
  d.resolve(42)
  assert.equal(await d, 42)
})

test('Defer rejects with an error', async () => {
  const d = new Defer<number>()
  d.reject(new Error('nope'))
  await assert.rejects(d, /nope/)
})

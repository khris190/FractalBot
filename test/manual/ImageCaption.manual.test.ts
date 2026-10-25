/**
 * MANUAL GRADE — image captioning against the local LLM (real network, slow).
 * The test asserts only machine-checkable SHAPE (non-empty, ≤20 words, one line —
 * the prompt contract). Whether the caption is actually about the image is graded
 * BY A HUMAN reading the printed output. Run: npm run test:manual
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LLM_HOST = '192.168.100.21:1234'

const dir = mkdtempSync(join(tmpdir(), 'fractal-manual-caption-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.DB_FILE = 'test.sqlite'
process.env.LLM_DATA_PATH = join(dir, 'LLM')
process.env.LLM_ENDPOINT = LLM_HOST
process.env.LLM_MODE = 'chat'
process.env.LLM_MODEL = 'local'

mkdirSync(process.env.LLM_DATA_PATH!)
writeFileSync(join(process.env.LLM_DATA_PATH!, 'prompt.txt'), 'You are Chucha.\n')

// Mock DailyRoll before anything loads getLogger — keeps the process from hanging.
const dailyRollPath = require.resolve('../../src/utils/logger/pino-daily-roll')
require.cache[dailyRollPath] = { id: dailyRollPath, filename: dailyRollPath, loaded: true, exports: () => ({ write: () => {}, flush: () => {}, end: () => {} }) } as any

const Model = (require('../../src/utils/AI/Model') as typeof import('../../src/utils/AI/Model')).default

let model: InstanceType<typeof Model>

before(async () => {
  // Hard-fail with a clear message when the local model is down (no auto-skip).
  try {
    const res = await fetch(`http://${LLM_HOST}/v1/models`, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (e: any) {
    throw new Error(`Local LLM unavailable at http://${LLM_HOST} — start the local server to run manual tests (probe failed: ${e?.message ?? e})`)
  }
  model = new Model()
})

// ---- minimal PNG encoder (no image deps) ------------------------------------
const CRC_TABLE = (() => {
  const t: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32 (buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk (type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function makePng (width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const stride = 1 + width * 4
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      const o = y * stride + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0 // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
// Ground truth: a solid red circle (r=24) centered on a plain white 64x64 background.
function fixturePng (): Buffer {
  const c = 31.5; const r2 = 24 * 24
  return makePng(64, 64, (x, y) => {
    const d = (x - c) ** 2 + (y - c) ** 2
    return d <= r2 ? [220, 30, 30] : [255, 255, 255]
  })
}

test('manual grade: captionImage describes the fixture image', async () => {
  const dataUrl = `data:image/png;base64,${fixturePng().toString('base64')}`
  const caption = await model.captionImage(dataUrl)
  const words = caption?.trim().split(/\s+/).filter(Boolean).length ?? 0

  console.log('')
  console.log('── MANUAL GRADE: image caption ─────────────────────────────')
  console.log('fixture:  solid red circle, centered, on a plain white background (64x64 PNG)')
  console.log(`caption:  ${JSON.stringify(caption)}`)
  console.log(`words:    ${words} (max 20)`)
  console.log('human:    does the caption actually describe the fixture? test gates shape only.')
  console.log('─────────────────────────────────────────────────────────────')
  console.log('')

  assert.ok(caption && caption.trim() !== '', `caption must not be empty, got: ${JSON.stringify(caption)}`)
  assert.ok(!caption.includes('\n'), 'caption must be a single line')
  assert.ok(words <= 20, `caption must be ≤20 words, was ${words}`)
})

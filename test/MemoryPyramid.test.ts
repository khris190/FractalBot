/**
 * Pure unit tests for the tiered memory pyramid (memoryPyramid.ts) — no DB, no LLM.
 * Layout migration, ISO-week math, promotion scanning (eligibility + ordering),
 * prompt-part ordering and the 12KB tail-trim.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Point env at a throwaway dir BEFORE requiring the pyramid module (it reads env at import).
const dir = mkdtempSync(join(tmpdir(), 'fractal-pyramid-'))
process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env'
process.env.DATA_PATH = dir
process.env.LLM_DATA_PATH = join(dir, 'LLM')
mkdirSync(process.env.LLM_DATA_PATH!)

const pyramid = require('../src/utils/AI/memoryPyramid') as typeof import('../src/utils/AI/memoryPyramid')
const { ensureLayout, dailyFile, weeklyFile, monthlyFile, yearlyFile, warsawYmd, isoWeekKeyOfYmd, ymdsOfIsoWeek, nextPromotionUnit, buildMemoryParts, loadTieredMemory, MEMORY_PROMPT_MAX_BYTES } = pyramid

const LEGACY = join(process.env.LLM_DATA_PATH!, 'memory', 'legacy.txt')
const OLD_MEMORY = join(process.env.LLM_DATA_PATH!, 'memory.txt')

// now = Monday 2026-01-05 (Warsaw) → current week W02; W01 = 2025-12-29..2026-01-04 (fully past).
const NOW = new Date('2026-01-05T12:00:00Z')
const W01_DAYS = ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']

function reset (files: Record<string, string> = {}) {
  rmSync(join(process.env.LLM_DATA_PATH!, 'memory'), { recursive: true, force: true })
  rmSync(OLD_MEMORY, { force: true })
  ensureLayout()
  for (const [path, content] of Object.entries(files)) writeFileSync(path, content)
}

// ============ Layout + migration ============

test('ensureLayout creates the tier dirs and is idempotent', () => {
  reset()
  assert.ok(existsSync(dailyFile('2026-01-01').slice(0, dailyFile('2026-01-01').lastIndexOf('/')))) // daily dir
  ensureLayout() // second call: no memory.txt, nothing to do
  assert.ok(!existsSync(OLD_MEMORY))
})

test('ensureLayout migrates memory.txt → legacy.txt', () => {
  reset()
  writeFileSync(OLD_MEMORY, 'old notes\n')
  ensureLayout()
  assert.ok(!existsSync(OLD_MEMORY), 'original memory.txt gone')
  assert.equal(readFileSync(LEGACY, 'utf8'), 'old notes\n')
})

test('ensureLayout appends a straggler memory.txt onto an existing legacy', () => {
  reset()
  writeFileSync(OLD_MEMORY, 'old notes\n')
  ensureLayout()
  writeFileSync(OLD_MEMORY, 'straggler note\n')
  ensureLayout()
  assert.ok(!existsSync(OLD_MEMORY))
  const legacy = readFileSync(LEGACY, 'utf8')
  assert.ok(legacy.includes('old notes'), 'original legacy kept')
  assert.ok(legacy.includes('straggler note'), 'straggler appended')
})

// ============ Warsaw calendar helpers ============

test('warsawYmd uses Europe/Warsaw, not local/UTC', () => {
  assert.equal(warsawYmd(new Date('2026-01-05T22:30:00Z')), '2026-01-05') // 23:30 Warsaw, same day
  assert.equal(warsawYmd(new Date('2026-01-05T23:30:00Z')), '2026-01-06') // 00:30 Warsaw, next day
})

test('isoWeekKeyOfYmd + ymdsOfIsoWeek round-trip (incl. year-straddling week)', () => {
  assert.equal(isoWeekKeyOfYmd('2026-01-05'), '2026-W02') // Monday
  assert.deepEqual(ymdsOfIsoWeek('2026-W02'), ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'])
  // Week 1 of 2026 straddles the year: Mon 2025-12-29 .. Sun 2026-01-04
  assert.equal(isoWeekKeyOfYmd('2025-12-29'), '2026-W01')
  assert.equal(isoWeekKeyOfYmd('2026-01-04'), '2026-W01')
  assert.deepEqual(ymdsOfIsoWeek('2026-W01'), W01_DAYS)
})

// ============ nextPromotionUnit ============

test('nextPromotionUnit: null when nothing is pending', () => {
  reset()
  assert.equal(nextPromotionUnit(NOW), null)
})

test('nextPromotionUnit: complete week of dailies → weekly unit, inputs oldest-first', () => {
  reset(Object.fromEntries(W01_DAYS.map(d => [dailyFile(d), `fact ${d}\n`])) as Record<string, string>)
  const unit = nextPromotionUnit(NOW)
  assert.ok(unit, 'week 2026-W01 is fully in the past — eligible')
  assert.equal(unit.tier, 'weekly')
  assert.equal(unit.key, '2026-W01')
  assert.deepEqual(unit.inputs, W01_DAYS.map(dailyFile), 'all 7 dailies, oldest first')
  assert.equal(unit.target, weeklyFile('2026-W01'))
  assert.equal(unit.periodStart, '2025-12-29')
})

test('nextPromotionUnit: the week containing today is never eligible', () => {
  reset({ [dailyFile('2026-01-05')]: 'today\n', [dailyFile('2026-01-06')]: 'tomorrow\n' })
  assert.equal(nextPromotionUnit(NOW), null, 'W02 is the current week')
})

test('nextPromotionUnit: complete week already merged (weekly exists) → not eligible', () => {
  reset(Object.fromEntries([
    ...W01_DAYS.map(d => [dailyFile(d), `fact ${d}\n`]),
    [weeklyFile('2026-W01'), 'merged\n'],
  ]) as Record<string, string>)
  assert.equal(nextPromotionUnit(NOW), null)
})

test('nextPromotionUnit: complete month (no leftover dailies, weekly in it) → monthly unit', () => {
  // 2025-W52 = Mon 2025-12-22 .. Sun 2025-12-28 — fully in Dec 2025, no dailies anywhere.
  reset({ [weeklyFile('2025-W52')]: 'week 52\n' })
  const unit = nextPromotionUnit(NOW)
  assert.ok(unit)
  assert.equal(unit.tier, 'monthly')
  assert.equal(unit.key, '2025-12')
  assert.deepEqual(unit.inputs, [weeklyFile('2025-W52')])
  assert.equal(unit.target, monthlyFile('2025-12'))
})

test('nextPromotionUnit: leftover dailies in the month block the monthly merge (weeks merge first)', () => {
  // W51 dailies (Dec 15-21) exist → Dec 2025 has leftover dailies → only the weekly is eligible.
  const w51 = ['2025-12-15', '2025-12-16', '2025-12-17', '2025-12-18', '2025-12-19', '2025-12-20', '2025-12-21']
  reset(Object.fromEntries(w51.map(d => [dailyFile(d), `fact ${d}\n`])) as Record<string, string>)
  const unit = nextPromotionUnit(NOW)
  assert.ok(unit)
  assert.equal(unit.tier, 'weekly', 'the week merges before its month can')
  assert.equal(unit.key, '2025-W51')
})

test('nextPromotionUnit: complete year (monthlies, no dailies/weeklies) → yearly unit', () => {
  reset({ [monthlyFile('2025-06')]: 'june\n', [monthlyFile('2025-07')]: 'july\n' })
  const unit = nextPromotionUnit(NOW)
  assert.ok(unit)
  assert.equal(unit.tier, 'yearly')
  assert.equal(unit.key, '2025')
  assert.deepEqual(unit.inputs, [monthlyFile('2025-06'), monthlyFile('2025-07')])
  assert.equal(unit.target, yearlyFile('2025'))
})

test('nextPromotionUnit: oldest eligible unit comes first (two complete weeks)', () => {
  const w51 = ['2025-12-15', '2025-12-16', '2025-12-17', '2025-12-18', '2025-12-19', '2025-12-20', '2025-12-21']
  const w52 = ['2025-12-22', '2025-12-23', '2025-12-24', '2025-12-25', '2025-12-26', '2025-12-27', '2025-12-28']
  reset(Object.fromEntries([...w51, ...w52].map(d => [dailyFile(d), `fact ${d}\n`])) as Record<string, string>)
  assert.equal(nextPromotionUnit(NOW)?.key, '2025-W51', 'W51 (Dec 15) is older than W52 (Dec 22)')
})

test('nextPromotionUnit: oldest period first (Nov monthly before Dec weekly)', () => {
  // 2025-W46 = Mon 2025-11-10 .. Sun 2025-11-16 (weekly already exists for it).
  const w51 = ['2025-12-15', '2025-12-16', '2025-12-17', '2025-12-18', '2025-12-19', '2025-12-20', '2025-12-21']
  reset(Object.fromEntries([
    [weeklyFile('2025-W46'), 'week 46\n'],
    ...w51.map(d => [dailyFile(d), `fact ${d}\n`]),
  ]) as Record<string, string>)
  const unit = nextPromotionUnit(NOW)
  assert.ok(unit)
  assert.equal(unit.tier, 'monthly', '2025-11-01 < 2025-12-15 → month first')
  assert.equal(unit.key, '2025-11')
})

// ============ Prompt parts + trim ============

test('buildMemoryParts: newest-first order dailies → weekly → monthly → yearly → legacy; empty files skipped', () => {
  reset({
    [dailyFile('2026-01-03')]: 'd3\n',
    [dailyFile('2026-01-04')]: 'd4\n',
    [weeklyFile('2026-W01')]: 'wk\n',
    [weeklyFile('2025-W51')]: '', // empty → filtered out
    [monthlyFile('2025-12')]: 'mo\n',
    [yearlyFile('2025')]: 'yr\n',
    [LEGACY]: 'lg\n',
  })
  const parts = buildMemoryParts()
  assert.deepEqual(parts.map(p => p.label), ['Daily 2026-01-04', 'Daily 2026-01-03', 'Weekly 2026-W01', 'Monthly 2025-12', 'Yearly 2025', 'Legacy'])
})

test('loadTieredMemory: empty layout → empty string', () => {
  reset()
  assert.equal(loadTieredMemory(), '')
})

test('loadTieredMemory: over-budget trim drops the oldest parts first (legacy goes)', () => {
  const huge = 'L'.repeat(MEMORY_PROMPT_MAX_BYTES + 5_000)
  reset({ [dailyFile('2026-01-03')]: 'd3\n', [dailyFile('2026-01-04')]: 'd4\n', [LEGACY]: huge })
  const out = loadTieredMemory()
  assert.ok(out.includes('d4') && out.includes('d3'), 'recent dailies survive')
  assert.ok(!out.includes('LL'), 'legacy dropped to fit the budget')
  assert.ok(Buffer.byteLength(out) <= MEMORY_PROMPT_MAX_BYTES)
})

test('loadTieredMemory: a single part is never dropped, even over budget', () => {
  const huge = 'Y'.repeat(MEMORY_PROMPT_MAX_BYTES + 5_000)
  reset({ [yearlyFile('2025')]: huge })
  const out = loadTieredMemory()
  assert.ok(out.includes('YYYY'), 'the only part is kept whole')
})

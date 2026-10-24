/**
 * Tiered memory ("pyramid") storage:
 *
 *   LLM_DATA_PATH/
 *     memory/
 *       legacy.txt            — pre-pyramid memory.txt (migrated once, injected, never merged)
 *       daily/2026-10-24.txt  — raw distillation of each day's conversations (append-only)
 *       weekly/2026-W43.txt   — merged from the week's dailies (inputs archived, then deleted)
 *       monthly/2026-10.txt   — merged from the month's weeklies
 *       yearly/2026.txt       — merged from the year's monthlies
 *       archive/2026-W43.inputs.txt — the merged input notes (quality artifact, never injected)
 *       distill/2026-10-24.txt      — the prompt transcript per conversation day (quality artifact)
 *
 * Promotion rule (the "daily sleep" runs it): once a CALENDAR unit is fully in the past,
 * it is merged into the tier above and its input files are deleted. A week is complete
 * when all 7 of its days are past; a month when it has no leftover dailies and at least
 * one weekly; a year when it has no dailies/weeklies and at least one monthly. This keeps
 * every merge small (a bounded set of input notes), which is what makes "keep all facts"
 * reliable for the model.
 *
 * All calendar math uses Europe/Warsaw dates (same clock as the consolidation interval).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import env from '../env'

const TIMEZONE = 'Europe/Warsaw'
const MEMORY_DIR = join(env.LLM_DATA_PATH, 'memory')
const LEGACY_FILE = join(MEMORY_DIR, 'legacy.txt')
const OLD_MEMORY_FILE = join(env.LLM_DATA_PATH, 'memory.txt')

// Line caps per merged tier — enforced in the merge prompt (Model.promoteMemory), not here.
export const TIER_CAP_LINES = { weekly: 40, monthly: 50, yearly: 80 } as const

// Total budget for the memory block injected into prompts; overflow drops the oldest parts first.
export const MEMORY_PROMPT_MAX_BYTES = 12_000

export const dailyDir = join(MEMORY_DIR, 'daily')
export const weeklyDir = join(MEMORY_DIR, 'weekly')
export const monthlyDir = join(MEMORY_DIR, 'monthly')
export const yearlyDir = join(MEMORY_DIR, 'yearly')
// Quality artifacts — never injected into prompts, never scanned for promotions.
export const archiveDir = join(MEMORY_DIR, 'archive')
export const distillDir = join(MEMORY_DIR, 'distill')

export const dailyFile = (ymd: string): string => join(dailyDir, `${ymd}.txt`)
export const weeklyFile = (weekKey: string): string => join(weeklyDir, `${weekKey}.txt`)
export const monthlyFile = (monthKey: string): string => join(monthlyDir, `${monthKey}.txt`)
export const yearlyFile = (yearKey: string): string => join(yearlyDir, `${yearKey}.txt`)
// Merged inputs of one promotion, keyed like the target (e.g. archive/2026-W43.inputs.txt).
export const archiveFile = (key: string): string => join(archiveDir, `${key}.inputs.txt`)
// The prompt transcript of one conversation day, appended per run.
export const distillFile = (ymd: string): string => join(distillDir, `${ymd}.txt`)

// ============ Warsaw calendar helpers ============

export function warsawYmd (now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// ISO-8601 week key (e.g. '2026-W43') of a calendar date given as 'YYYY-MM-DD'.
export function isoWeekKeyOfYmd (ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dayNum = date.getUTCDay() || 7 // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum // Thursday of this ISO week
  )
  const isoYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

// The 7 'YYYY-MM-DD' days (Monday-first) of an ISO week.
export function ymdsOfIsoWeek (weekKey: string): string[] {
  const [isoYear, w] = weekKey.split('-W').map(Number)
  const jan4 = new Date(Date.UTC(isoYear, 0, 4)) // Jan 4 is always in ISO week 1
  const dow = jan4.getUTCDay() || 7
  const mondayW1 = new Date(jan4)
  mondayW1.setUTCDate(jan4.getUTCDate() - (dow - 1))
  const monday = new Date(mondayW1)
  monday.setUTCDate(mondayW1.getUTCDate() + (w - 1) * 7)
  const toYmd = (d: Date) => d.toISOString().slice(0, 10)
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday)
    day.setUTCDate(monday.getUTCDate() + i)
    return toYmd(day)
  })
}

export const monthKeyOfYmd = (ymd: string): string => ymd.slice(0, 7) // 'YYYY-MM'
export const yearKeyOfYmd = (ymd: string): string => ymd.slice(0, 4) // 'YYYY'

// ============ Layout ============

// Creates the tier dirs (and artifact dirs) and migrates the pre-pyramid memory.txt once (idempotent).
export function ensureLayout (): void {
  mkdirSync(dailyDir, { recursive: true })
  mkdirSync(weeklyDir, { recursive: true })
  mkdirSync(monthlyDir, { recursive: true })
  mkdirSync(yearlyDir, { recursive: true })
  mkdirSync(archiveDir, { recursive: true })
  mkdirSync(distillDir, { recursive: true })
  if (existsSync(OLD_MEMORY_FILE)) {
    if (existsSync(LEGACY_FILE)) {
      // Legacy already migrated; fold any straggler in instead of clobbering it.
      writeFileSync(LEGACY_FILE, readFileSync(OLD_MEMORY_FILE, 'utf8') + '\n', { flag: 'a+' })
      unlinkSync(OLD_MEMORY_FILE)
    } else {
      renameSync(OLD_MEMORY_FILE, LEGACY_FILE)
    }
  }
}

function listTier (dir: string, prefix: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.txt'))
    .map((f) => f.slice(0, -4))
    .sort()
}

const listDaily = (): string[] => listTier(dailyDir, '')
const listWeekly = (): string[] => listTier(weeklyDir, '')
const listMonthly = (): string[] => listTier(monthlyDir, '')
const listYearly = (): string[] => listTier(yearlyDir, '')

// ============ Promotion scanning (pure — no LLM, no writes) ============

export interface PromotionUnit {
  tier: keyof typeof TIER_CAP_LINES
  key: string // week/month/year key
  inputs: string[] // full paths of the files to merge (oldest first)
  target: string // full path of the merged file
  capLines: number
  // Period start 'YYYY-MM-DD' — used to process the oldest unit first.
  periodStart: string
}

// The oldest calendar unit that is complete and not yet merged, or null.
export function nextPromotionUnit (now: Date): PromotionUnit | null {
  const today = warsawYmd(now)
  const currentWeek = isoWeekKeyOfYmd(today)
  const currentMonth = monthKeyOfYmd(today)
  const currentYear = yearKeyOfYmd(today)

  const dailies = listDaily()
  const weeklies = listWeekly()
  const monthlies = listMonthly()
  const yearly = listYearly()

  const units: PromotionUnit[] = []

  // Weeks: complete (all 7 days past), not the current week, has dailies, no weekly file yet.
  const weekKeys = Array.from(new Set(dailies.map(isoWeekKeyOfYmd)))
  for (const wk of weekKeys.sort()) {
    if (wk === currentWeek) continue
    const days = ymdsOfIsoWeek(wk)
    const weekComplete = days.every((d) => d < today)
    if (!weekComplete) continue
    const weekDailies = days.filter((d) => dailies.includes(d)).sort()
    if (weekDailies.length === 0) continue
    if (weeklies.includes(wk)) continue
    units.push({
      tier: 'weekly',
      key: wk,
      inputs: weekDailies.map(dailyFile),
      target: weeklyFile(wk),
      capLines: TIER_CAP_LINES.weekly,
      periodStart: days[0],
    })
  }

  // Months: fully past, no leftover dailies, at least one weekly whose Monday sits in the month.
  const monthKeys = new Set<string>()
  for (const d of dailies) monthKeys.add(monthKeyOfYmd(d))
  for (const wk of weeklies) monthKeys.add(monthKeyOfYmd(ymdsOfIsoWeek(wk)[0]))
  for (const mk of Array.from(monthKeys).sort()) {
    if (mk === currentMonth) continue
    if (monthlies.includes(mk)) continue
    if (dailies.some((d) => monthKeyOfYmd(d) === mk)) continue // weeklies for it will merge first
    const monthWeeklies = weeklies
      .filter((wk) => monthKeyOfYmd(ymdsOfIsoWeek(wk)[0]) === mk)
      .sort()
    if (monthWeeklies.length === 0) continue
    units.push({
      tier: 'monthly',
      key: mk,
      inputs: monthWeeklies.map(weeklyFile),
      target: monthlyFile(mk),
      capLines: TIER_CAP_LINES.monthly,
      periodStart: `${mk}-01`,
    })
  }

  // Years: fully past, no leftover dailies/weeklies, at least one monthly.
  const yearKeys = new Set<string>()
  for (const d of dailies) yearKeys.add(yearKeyOfYmd(d))
  for (const wk of weeklies) yearKeys.add(yearKeyOfYmd(ymdsOfIsoWeek(wk)[0]))
  for (const mk of monthlies) yearKeys.add(mk.slice(0, 4))
  for (const yk of Array.from(yearKeys).sort()) {
    if (yk === currentYear) continue
    if (yearly.includes(yk)) continue
    if (dailies.some((d) => yearKeyOfYmd(d) === yk)) continue
    if (weeklies.some((wk) => yearKeyOfYmd(ymdsOfIsoWeek(wk)[0]) === yk)) continue
    const yearMonthlies = monthlies.filter((mk) => mk.startsWith(`${yk}-`)).sort()
    if (yearMonthlies.length === 0) continue
    units.push({
      tier: 'yearly',
      key: yk,
      inputs: yearMonthlies.map(monthlyFile),
      target: yearlyFile(yk),
      capLines: TIER_CAP_LINES.yearly,
      periodStart: `${yk}-01-01`,
    })
  }

  if (units.length === 0) return null
  units.sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1))
  return units[0]
}

// ============ Prompt injection ============

export interface MemoryPart { label: string, content: string }

// All tiers, newest-first: daily files (newest date first), then the latest existing
// weekly / monthly / yearly, then the pre-pyramid legacy notes.
export function buildMemoryParts (): MemoryPart[] {
  ensureLayout()
  const parts: MemoryPart[] = []
  for (const d of listDaily().reverse()) parts.push({ label: `Daily ${d}`, content: readFileSync(dailyFile(d), 'utf8').trim() })
  const weekly = listWeekly()
  if (weekly.length > 0) parts.push({ label: `Weekly ${weekly[weekly.length - 1]}`, content: readFileSync(weeklyFile(weekly[weekly.length - 1]), 'utf8').trim() })
  const monthly = listMonthly()
  if (monthly.length > 0) parts.push({ label: `Monthly ${monthly[monthly.length - 1]}`, content: readFileSync(monthlyFile(monthly[monthly.length - 1]), 'utf8').trim() })
  const yearly = listYearly()
  if (yearly.length > 0) parts.push({ label: `Yearly ${yearly[yearly.length - 1]}`, content: readFileSync(yearlyFile(yearly[yearly.length - 1]), 'utf8').trim() })
  if (existsSync(LEGACY_FILE)) parts.push({ label: 'Legacy', content: readFileSync(LEGACY_FILE, 'utf8').trim() })
  return parts.filter((p) => p.content !== '')
}

// The memory block for prompts: newest-first, tail-trimmed (oldest parts first) to the budget.
export function loadTieredMemory (): string {
  const parts = buildMemoryParts()
  if (parts.length === 0) return ''
  const render = (ps: MemoryPart[]) => ps.map((p) => `## ${p.label}\n${p.content}`).join('\n\n')
  let kept = parts
  while (kept.length > 1 && Buffer.byteLength(render(kept)) > MEMORY_PROMPT_MAX_BYTES) {
    kept = kept.slice(0, -1)
  }
  return render(kept)
}

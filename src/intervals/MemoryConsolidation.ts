import { Client } from '../Client'
import LLMPingResponseHandler from '../responses/LLMPingResponseHandler'
import { status } from '../utils/status'
import ILogger from '../utils/logger/ILogger'
import BaseInterval from './BaseInterval'

// Fires the same consolidation as /remember once a day — on the first tick at or after
// 05:00 Europe/Warsaw, so a drifted or missed tick can't skip the day. Boot before 05:00 →
// consolidates at 05:00 the same day; boot at/after 05:00 → waits for the next day (no
// catch-up run on a late boot). The host timezone is irrelevant — time is computed in
// Warsaw explicitly, so this stays correct across DST without any manual offset config.
const TIMEZONE = 'Europe/Warsaw'
const TARGET_HM = '05:00'

function warsawToday (now: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function warsawHm (now: Date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(now)
}

// Boot-time gate (evaluated once per process): started at/after today's target → today is
// already spent, wait for tomorrow; started before → today's first tick at/after the target
// fires (e.g. a 02:00 boot consolidates at 05:00). Exported so tests can drive it with
// deterministic instants instead of the real boot clock.
export function initialLastRunDate (now: Date) {
  return warsawHm(now) >= TARGET_HM ? warsawToday(now) : ''
}

class MemoryConsolidationInterval extends BaseInterval {
  // Boot gate (see initialLastRunDate): '' if we booted before today's target (today's
  // 05:00 tick may fire), today's date if we booted at/after it (wait for tomorrow). After
  // the first run it holds the run day, which `lastRunDate === today` uses as the lock.
  lastRunDate = initialLastRunDate(new Date())

  // `now` is injectable so tests can drive the schedule deterministically.
  async run (self: Client, logger: ILogger, now: Date = new Date()) {
    // HH:MM and YYYY-MM-DD in Warsaw. hourCycle 'h23' + en-CA give zero-padded values,
    // so lexicographic compare of HH:MM is chronological.
    const hm = warsawHm(now)
    const today = warsawToday(now)

    if (this.lastRunDate === today) return
    // First tick at or after the target time fires; lastRunDate (above) prevents a second run
    // the same day. An exact match would skip the day entirely if a tick drifted past 05:00.
    if (hm < TARGET_HM) return
    this.lastRunDate = today

    logger.info('Scheduled memory consolidation starting')
    status.beginDreaming()
    try {
      const model = LLMPingResponseHandler.model
      // No busy-wait needed — both runs go through the Model's single-flight queue.
      await model.consolidateMemory()
      // Promote complete calendar units up the pyramid (week → month → year); no-op when
      // nothing is pending. Inputs of a failed merge are kept and retried on the next sleep.
      await model.promoteMemory()
      logger.info('Scheduled memory consolidation done')
    } catch (e) {
      // Consolidation is already a no-op when there's nothing to compress, so this only
      // logs on real failures; we never want it to take the bot down.
      logger.error('Scheduled memory consolidation failed', e as Error)
    } finally {
      status.endDreaming()
    }
  }
}

const interval = new MemoryConsolidationInterval()
export default interval

import { Client } from '../Client'
import LLMPingResponseHandler from '../responses/LLMPingResponseHandler'
import ILogger from '../utils/logger/ILogger'
import BaseInterval from './BaseInterval'

// Fires the same consolidation as /remember once a day at 05:00 Europe/Warsaw.
// If the bot was down when 05:00 passed, it simply waits for the next day.
// The host timezone is irrelevant — time is computed in Warsaw explicitly, so this
// stays correct across DST without any manual offset config.
const TIMEZONE = 'Europe/Warsaw'
const TARGET_HM = '05:00'

function warsawToday (now: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

class MemoryConsolidationInterval extends BaseInterval {
  // Initialize to today so we skip the boot-day and only fire on future days.
  lastRunDate = warsawToday(new Date())

  // `now` is injectable so tests can drive the schedule deterministically.
  async run (self: Client, logger: ILogger, now: Date = new Date()) {
    // HH:MM and YYYY-MM-DD in Warsaw. hourCycle 'h23' + en-CA give zero-padded values,
    // so lexicographic compare of HH:MM is chronological.
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(now)
    const today = warsawToday(now)

    if (this.lastRunDate === today) return
    if (hm !== TARGET_HM) return
    this.lastRunDate = today

    logger.info('Scheduled memory consolidation starting')
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
    }
  }
}

const interval = new MemoryConsolidationInterval()
export default interval

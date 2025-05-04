import { pino } from 'pino'

import ILogger from './ILogger'
import PinoLogger from './PinoLogger'
import DailyRoll from './pino-daily-roll'
import Pretty from 'pino-pretty'
import env from '../env'

export default function getLogger (moduleName:string): ILogger {
  const dailyTarget = DailyRoll({
    file: `${env.LOG_PATH}/${moduleName}/app`,
    extension: '.log',
    mkdir: true,
  })

  const targets = []
  targets.push({ stream: dailyTarget })
  if (process.env.ENV === 'development') {
    targets.push({ stream: Pretty({ destination: 1 }) })
  }
  return new PinoLogger(pino({}, pino.multistream(targets)))
}

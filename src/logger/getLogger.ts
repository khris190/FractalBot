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
  const pinoOptions = {
    level: 'trace',
    customLevels: {
      notice: 25
    }
  }
  targets.push({
    stream: dailyTarget,
    ...pinoOptions,
    level: 'info'
  })
  targets.push({
    stream: Pretty({
      destination: 1,
    }),
    ...pinoOptions,
  })
  return new PinoLogger(
    pino(
      {
        ...pinoOptions,
      },
      pino.multistream(targets)
    )
  )
}

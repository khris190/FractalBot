import { DestinationStream, pino, StreamEntry } from 'pino'
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

  const targets:(DestinationStream | StreamEntry<string>)[] = []
  const customLevels = {
    notice: 25
  }
  targets.push({
    stream: dailyTarget,
    level: 'info',

  })
  targets.push({
    stream: Pretty({
      destination: 1,
    }),
    level: 'trace',
  })
  return new PinoLogger(
    pino(
      {
        level: 'trace',
        customLevels,
      },
      pino.multistream(targets)
    )
  )
}

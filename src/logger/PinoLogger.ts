import pino from 'pino'
import ILogger from './ILogger.ts'

export default class PinoLogger implements ILogger {
  pinoLogger: pino.Logger

  constructor (pinoLogger:pino.Logger) {
    this.pinoLogger = pinoLogger
  }

  debug (msg:string, obj:object) {
    this.pinoLogger.debug(obj, msg)
  }

  error (msg:string, obj:object) {
    this.pinoLogger.error(obj, msg)
  }

  fatal (msg:string, obj:object) {
    this.pinoLogger.fatal(obj, msg)
  }

  info (msg:string, obj:object) {
    this.pinoLogger.info(obj, msg)
  }

  trace (msg:string, obj:object) {
    this.pinoLogger.trace(obj, msg)
  }

  warn (msg:string, obj:object) {
    this.pinoLogger.warn(obj, msg)
  }
}

import { Logger } from 'pino'
import ILogger from './ILogger'

export default class PinoLogger implements ILogger {
  pinoLogger
  constructor (pinoLogger: Logger<'notice', false>) {
    this.pinoLogger = pinoLogger
  }

  isLevelEnabled (s: string): boolean {
    return this.pinoLogger.isLevelEnabled(s)
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

  notice (msg:string, obj:object) {
    this.pinoLogger.notice(obj, msg)
  }

  trace (msg:string, obj:object) {
    this.pinoLogger.trace(obj, msg)
  }

  warn (msg:string, obj:object) {
    this.pinoLogger.warn(obj, msg)
  }
}

import ILogger from './ILogger.js'

export default class TestLogger implements ILogger {
  debug (_msg: any, ..._args: any[]) {
  }

  error (_msg: string, ..._args: object[]) {
  }

  fatal (_msg: any, ..._args: any[]) {
  }

  info (_msg: string, ..._args: undefined[]) {
  }

  trace (_msg: any, ..._args: any[]) {
  }

  warn (_msg: any, ..._args: any[]) {
  }
}

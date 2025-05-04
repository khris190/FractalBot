export default interface ILogger {

  debug (msg:string, obj?:object): void

  error (msg:string, obj?:object): void

  fatal (msg:string, obj?:object): void

  info (msg:string, obj?:object): void

  trace (msg:string, obj?:object): void

  warn (msg:string, obj?:object): void
}

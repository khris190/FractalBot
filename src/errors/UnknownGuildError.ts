export default class UnknownGuildError extends Error {
  constructor (message:string = 'UnknownGuildError') {
    super(message)
  }
}

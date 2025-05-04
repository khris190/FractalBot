import BaseError from './BaseError'

export default class UnknownGuildError extends BaseError {
  constructor (message:string = 'UnknownGuildError') {
    super(message)
  }
}

export default class BaseError extends Error {
  constructor (message:string = 'CustomError') {
    super(message)
  }

  toJSON () {
    return {
      type: this.constructor.name,
      message: this.message,
      stack: this.stack
    }
  }
}

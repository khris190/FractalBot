export function getRandomFromArr (arr: any[]) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export class Defer<T> extends Promise<T> {
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: any) => void

  constructor () {
    let res!:(value: T | PromiseLike<T>) => void
    let rej!:(value: T | PromiseLike<T>) => void

    super((resolve, reject) => {
      res = resolve
      rej = reject
    })

    this.resolve = res
    this.reject = rej
  }

  static get [Symbol.species] () {
    return Promise
  }

  get [Symbol.toStringTag] () {
    return 'Defer'
  }
}

export function sleep (ms:number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class WeightedMessage {
  msg: string | MessageArr
  #baseWeight: number
  weight: number
  mult: number
  constructor (msg:string | MessageArr, weight:number = 1, mult:number = 1) {
    if (weight <= 0) {
      throw new Error('weight must be positive, passed: ' + weight)
    }
    this.msg = msg
    this.#baseWeight = weight
    this.weight = weight
    this.mult = mult
  }

  resetWeight () {
    this.weight = this.#baseWeight
  }
}

type WeightedMessageTuple = [string, number] | [string, number, number]
type WeightedArrTuple = [WeightedArrType, number] | [WeightedArrType, number, number]
type WeightedArrType = (WeightedArrType | string | WeightedArrTuple | WeightedMessageTuple)[]

function isWeightedMessageTuple (value: any): value is WeightedMessageTuple {
  return (
    Array.isArray(value) &&
    (value.length === 2 || value.length === 3) &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'number' &&
      (['number', 'undefined'].includes(typeof value[2]))
  )
}
function isWeightedArrTuple (value: any): value is WeightedArrTuple {
  return (
    Array.isArray(value) &&
    (value.length === 2 || value.length === 3) &&
    Array.isArray(value[0]) &&
    typeof value[1] === 'number' &&
      (['number', 'undefined'].includes(typeof value[2]))
  )
}

export class MessageArr {
  messages: WeightedMessage[]
  constructor (messages: WeightedArrType) {
    this.messages = []
    for (const msg of messages) {
      if (typeof msg === 'string') {
        this.messages.push(new WeightedMessage(msg))
      } else if (isWeightedMessageTuple(msg)) {
        this.messages.push(new WeightedMessage(msg[0], msg[1], msg[2]))
      } else if (isWeightedArrTuple(msg)) {
        this.messages.push(new WeightedMessage(new MessageArr(msg[0]), msg[1], msg[2]))
      } else {
        this.messages.push(new WeightedMessage(new MessageArr(msg)))
      }
    }
  }

  add (msg: WeightedMessage | string, weight = 1, mult = 1) {
    if (typeof msg === 'string') {
      this.messages.push(new WeightedMessage(msg, weight, mult))
    } else {
      this.messages.push(msg)
    }
    return this
  }

  chooseRandom ():number {
    let sum = 0
    let choice = -1
    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i]
      if (Math.random() >= sum / (sum + msg.weight)) {
        choice = i
      }
      sum += msg.weight
      msg.weight *= msg.mult// TODO: use a method
    }
    return choice
  }

  getRandom (): { choice: string, index: number[] } {
    const i = this.chooseRandom()
    const choice = this.messages[i]
    choice.resetWeight()
    if (choice.msg instanceof MessageArr) {
      const res = choice.msg.getRandom()
      return { choice: res.choice, index: [i, ...res.index] }
    } else {
      return { choice: choice.msg, index: [i] }
    }
  }
}

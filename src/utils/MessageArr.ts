export class WeightedMessage {
  msg: string | MessageArr
  weight: number
  constructor (msg:string | MessageArr, weight:number = 1) {
    this.msg = msg
    this.weight = weight
  }
}

type WeightedMessageTuple = [string, number]
type WeightedArrTuple = [WeightedArrType, number]
type WeightedArrType = (WeightedArrType | string | WeightedArrTuple | WeightedMessageTuple)[]

function isWeightedMessageTuple (value: any): value is WeightedMessageTuple {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'number'
  )
}
function isWeightedArrTuple (value: any): value is WeightedArrTuple {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Array.isArray(value[0]) &&
    typeof value[1] === 'number'
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
        this.messages.push(new WeightedMessage(msg[0], msg[1]))
      } else if (isWeightedArrTuple(msg)) {
        this.messages.push(new WeightedMessage(new MessageArr(msg[0]), msg[1]))
      } else {
        this.messages.push(new WeightedMessage(new MessageArr(msg)))
      }
    }
  }

  add (msg: WeightedMessage | string, weight = 1) {
    if (typeof msg === 'string') {
      this.messages.push(new WeightedMessage(msg, weight))
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
    }
    return choice
  }

  getRandom (): { choice: string, index: number[] } {
    const i = this.chooseRandom()
    if (this.messages[i].msg instanceof MessageArr) {
      const res = this.messages[i].msg.getRandom()
      return { choice: res.choice, index: [i, ...res.index] }
    } else {
      return { choice: this.messages[i].msg, index: [i] }
    }
  }
}

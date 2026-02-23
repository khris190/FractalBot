type messageType = 'System' | 'Assistant' | 'User'

type TMessage = [messageType, string] | { type: messageType, msg: string }

export class Message {
  type: messageType
  msg: string
  prefix: string = ''
  postfix: string = ''
  constructor (type: messageType, msg: string, pre = '', post = '') {
    this.type = type
    this.msg = msg
    this.prefix = pre
    this.postfix = post
  }
}

export default class Chat {
  messages: Array<Message> = []
  constructor (arg:TMessage[] | null = null) {
    if (arg && arg.length) {

    } else {
      // this.messages.push({ type: 'System', msg: '' });
    }
  }

  toString () {
    let res = ''
    this.messages.forEach(el => {
      res += el.msg + '\n'
    })
    return res
  }

  toJson () {
    return JSON.stringify(this.messages)
  }

  static fromJson (json:string): Chat {
    return new Chat(JSON.parse(json))
  }
}

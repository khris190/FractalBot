import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import { MessageArr } from '../utils/MessageArr'

// TODO: move this and make usable everywhere
export class WeightedMessage {
  msg: string
  weight: number
  constructor (msg:string, weight:number = 1) {
    this.msg = msg
    this.weight = weight
  }
}

class PingQuestionResponseHandler extends BaseResponseHandler {
  #settings = {
    cooldownMs: 1000 * 60 * 60 * 36,
    cooldownMessage: 'Never again',
    messages: new MessageArr([
      ['Granted', 4],
      ['I sense a loophole', 11],
      ['Denied', 85],
    ])
  }

  lastMessageTime = 0
  #checkCooldown (cooldown = this.#settings.cooldownMs):boolean {
    const time = new Date().getTime()
    if (this.lastMessageTime + cooldown < time) {
      this.lastMessageTime = time
      return true
    }
    return false
  }

  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (Client.client.user?.id !== message.author.id) {
      if (message.mentions.users.some((user, key, coll) => {
        return user.id === Client.client.user?.id
      })) {
        if (message.content.replace(/<@\d+>/, '').toLowerCase().trim().startsWith('i wish')) {
          let response = this.#settings.cooldownMessage
          if (this.#checkCooldown()) {
            const res = this.#settings.messages.getRandom()
            response = res.choice
          }
          ReplyHelper.respond(message, ResponseType.DELAY_SAME_CHANNEL, { content: response })
          // message.reply({ content: response, flags: MessageFlags.SuppressNotifications })
          this.logger.info('Replied to the @ping wish ', { author: message.author.displayName })
          return true
        }
      }
    }
    return false
  }
}

export default new PingQuestionResponseHandler()

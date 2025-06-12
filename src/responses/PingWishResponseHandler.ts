import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { getRandomFromWeightedArr } from '../utils/helpers'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'

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
    messages: [
      new WeightedMessage('Granted', 4),
      new WeightedMessage('I sense a loophole', 11),
      new WeightedMessage('Denied', 85),
    ]
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
        if (message.content.replaceAll(/<@\d+>/, '').toLowerCase().trim().startsWith('i wish')) {
          let response = this.#settings.cooldownMessage
          if (this.#checkCooldown()) {
            const res = getRandomFromWeightedArr(this.#settings.messages)
            response = res.choice.msg
          }
          ReplyHelper.respond(message, ResponseType.DELAY_SAME_CHANNEL, { content: response })
          // message.reply({ content: response, flags: MessageFlags.SuppressNotifications })
          this.logger.info('Replied to the @ping message ', { author: message.author.displayName })
          return true
        }
      }
    }
    return false
  }
}

export default new PingQuestionResponseHandler()

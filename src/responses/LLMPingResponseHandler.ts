import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import Model from '../utils/AI/Model'

class LLMPingResponseHandler extends BaseResponseHandler {
  model = new Model()

  #settings = {
    cooldownMs: 1000 * 100,
    cooldownMessage: "I'm practicing self care, ever heard about it?",
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

  async _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): Promise<boolean> {
    if (Client.client.user?.id !== message.author.id) {
      if (message.mentions.users.some((user, key, coll) => {
        return user.id === Client.client.user?.id
      })) {
        let response = this.#settings.cooldownMessage
        if (this.#checkCooldown()) {
          try {
            response = await this.model.chatWithChucha(message.author.displayName + ': ' + message.cleanContent)
          } catch (error) {
            this.logger.error('LLM chucha error', error as Error)
            response = 'Error, please call my idiot of a creator, thanks.'
          }
        }
        ReplyHelper.respond(message, ResponseType.DELAY_REPLY, { content: response })
        // message.reply({ content: response, flags: MessageFlags.SuppressNotifications })
        this.logger.info('Replied to the @ping message ', { author: message.author.displayName })
        return true
      }
    }
    return false
  }
}

export default new LLMPingResponseHandler()

import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import Model from '../utils/AI/Model'

class LLMPingResponseHandler extends BaseResponseHandler {
  model = new Model()

  #settings = {
    cooldownMs: 1000 * 70,
    cooldownMessage: 'Can you pipe down and give me a minute? Like, literally?',
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
        if (this.model.busy) {
          return false
        }
        let response = this.#settings.cooldownMessage
        if (this.#checkCooldown()) {
          try {
            // const msg = message.cleanContent.replaceAll(Client.client.user?.displayName ?? 'Chucha', 'Chucha')
            const msg = message.cleanContent
            response = await this.model.chatWithChucha(message.author.displayName + ': ' + msg)
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

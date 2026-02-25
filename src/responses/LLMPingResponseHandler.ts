import { OmitPartialGroupDMChannel, Message, GuildMessageManager } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import Model from '../utils/AI/Model'

class LLMPingResponseHandler extends BaseResponseHandler {
  model = new Model()

  #settings = {
    cooldownMs: 1000 * 60,
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

  async prepareMessage (message: OmitPartialGroupDMChannel<Message<boolean>>) {
    const repl = (msg : OmitPartialGroupDMChannel<Message<boolean>>) => {
      msg.content = msg.content.replace(`<@${Client.client.user?.id}>`, '@Chucha')
      return (msg.author.displayName + ': ' + msg.cleanContent).replaceAll(Client.client.user?.displayName ?? 'Chucha', 'Chucha')
    }
    let res = ''
    let msg = message
    res = repl(msg)
    while (msg?.reference?.messageId) {
      msg = await (message.channel.messages as GuildMessageManager).fetch(msg.reference.messageId)
      res = repl(msg) + '\n' + res
    }
    return res
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
          message.channel.sendTyping()
          try {
            response = await this.model.chatWithChucha(await this.prepareMessage(message))
          } catch (error) {
            this.logger.error('LLM chucha error', error as Error)
            response = 'Error, please call my idiot of a creator, thanks.'
          }
          ReplyHelper.respond(message, ResponseType.REPLY, { content: response })
        } else {
          ReplyHelper.respond(message, ResponseType.DELAY_REPLY, { content: response })
        }
        this.logger.info('Replied to the @ping message ', { author: message.author.displayName })
        return true
      }
    }
    return false
  }
}

export default new LLMPingResponseHandler()

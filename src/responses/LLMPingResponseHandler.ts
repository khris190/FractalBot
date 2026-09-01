import { OmitPartialGroupDMChannel, Message, GuildMessageManager } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import Model from '../utils/AI/Model'
import conversationStore from '../utils/db/conversationStore'
import { settings } from '../settings'

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

  // Walk up the reference chain to find the root threadId and store each message in DB
  // (deduped by messageId — Chucha's replies are stored at generation time, so they're no-ops here).
  async prepareThread (message: OmitPartialGroupDMChannel<Message<boolean>>): Promise<string> {
    const repl = (msg : OmitPartialGroupDMChannel<Message<boolean>>) => {
      msg.content = msg.content.replace(`<@${Client.client.user?.id}>`, '@Chucha')
      return (msg.author.displayName + ': ' + msg.cleanContent).replaceAll(Client.client.user?.displayName ?? 'Chucha', 'Chucha')
    }

    const chain: OmitPartialGroupDMChannel<Message<boolean>>[] = []
    let current: OmitPartialGroupDMChannel<Message<boolean>> | null = message
    while (current) {
      chain.push(current)
      if (!current.reference?.messageId) break
      try {
        current = await (message.channel.messages as GuildMessageManager).fetch(current.reference.messageId)
      } catch {
        break // parent gone, stop walking up
      }
    }

    const threadId = chain[chain.length - 1].id
    for (let i = chain.length - 1; i >= 0; i--) {
      const msg = chain[i]
      const role = msg.author.id === Client.client.user?.id ? 'assistant' : 'user'
      conversationStore.addTurn(threadId, msg.id, role, repl(msg))
    }

    return threadId
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
        if (settings.ADMINS.some((a:string) => a === message.author.id) || this.#checkCooldown()) {
          message.channel.sendTyping()
          try {
            const threadId = await this.prepareThread(message)
            const reply = await this.model.chatWithChucha(threadId)

            // Send and store Chucha's response with its real Discord messageId so future
            // reference-walks dedupe it (no duplicate turns, no lost context)
            const sentMsg = await message.reply({ content: reply })
            conversationStore.addTurn(threadId, sentMsg.id, 'assistant', `Chucha: ${reply}`)
          } catch (error) {
            this.logger.error('LLM chucha error', error as Error)
            response = 'Error, please call my idiot of a creator, thanks.'
            ReplyHelper.respond(message, ResponseType.REPLY, { content: response })
          }
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

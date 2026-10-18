import { OmitPartialGroupDMChannel, Message, GuildMessageManager } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import Model from '../utils/AI/Model'
import conversationStore from '../utils/db/conversationStore'
import { settings } from '../settings'

// Max size of an image attachment forwarded to the LLM (8 MB)
export const MAX_IMAGE_SIZE = 8 * 1024 * 1024

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
      // Image data is never stored — only a marker so the model knows an image was in that turn
      const hasImage = msg.attachments?.some((a) => a.contentType?.startsWith('image/'))
      conversationStore.addTurn(threadId, msg.id, role, repl(msg) + (hasImage ? ' [image]' : ''))
    }

    return threadId
  }

  // Pick the single image attachment (image content-type, ≤ 8MB) and fetch it as a base64
  // data URL for the chat backend. Non-images, oversized files and download failures all
  // degrade to no-image (logged) — they must never block the reply.
  async extractImageDataUrl (message: OmitPartialGroupDMChannel<Message<boolean>>): Promise<string | undefined> {
    const image = message.attachments?.first()
    if (!image) return undefined
    if (!image.contentType?.startsWith('image/') || image.size > MAX_IMAGE_SIZE) {
      return undefined
    }
    try {
      const res = await fetch(image.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      return `data:${image.contentType};base64,${buf.toString('base64')}`
    } catch (e) {
      this.logger.warn('failed to fetch image attachment, replying without it', e as Error)
      return undefined
    }
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
            const imageUrl = await this.extractImageDataUrl(message)
            const reply = await this.model.chatWithChucha(threadId, imageUrl)

            // Send and store Chucha's response with its real Discord messageId so future
            // reference-walks dedupe it (no duplicate turns, no lost context)
            const sentMsg = await message.reply({ content: reply })
            conversationStore.addTurn(threadId, sentMsg.id, 'assistant', `Chucha: ${reply}`)
            // Seed 👍/👎 so users can rate the answer. Votes are tracked in DB by messageId
            // (see Client reaction listeners); a failure here must not undo the already-sent reply.
            try {
              await sentMsg.react('👍')
              await sentMsg.react('👎')
            } catch (e) {
              this.logger.error('failed to add rating reactions', e as Error)
            }
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

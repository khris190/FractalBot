import { OmitPartialGroupDMChannel, Message, GuildMessageManager, Attachment } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import Model, { ModelImageData } from '../utils/AI/Model'

class LLMPingResponseHandler extends BaseResponseHandler {
  model = new Model()

  #settings = {
    cooldownMs: 1000 * 1,
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
    const res : { msg: string, imgs: ModelImageData[] } = { msg: '', imgs: [] }
    let msg = message
    res.msg = repl(msg)

    for (const [id, attachment] of msg.attachments) {
      if (attachment instanceof Attachment) {
        if (attachment.contentType?.startsWith('image/')) { // Lepiej sprawdzać ogólnie image/
          const base64 = await this.encodeImageFromUrl(attachment.url)
          const idNumber = parseInt(id)
          res.imgs.push({ data: base64.replace(/data:image\/[^;]+;base64,/, ''), id: idNumber })
          res.msg = res.msg + `[img-${id}]`
        }
      }
    }
    while (msg?.reference?.messageId) {
      msg = await (message.channel.messages as GuildMessageManager).fetch(msg.reference.messageId)

      let images = ''
      for (const [id, attachment] of msg.attachments) {
        if (attachment instanceof Attachment) {
          if (attachment.contentType?.startsWith('image/')) { // Lepiej sprawdzać ogólnie image/
            const base64 = await this.encodeImageFromUrl(attachment.url)
            const idNumber = parseInt(id)
            res.imgs.push({ data: base64.replace(/data:image\/[^;]+;base64,/, ''), id: idNumber })
            images += `[img-${id}]`
          }
        }
      }
      res.msg = repl(msg) + images + '\n' + res.msg
    }
    console.log(res.msg)
    return res
  }

  async encodeImageFromUrl (url: string): Promise<string> {
    try {
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch image: status ${response.status}`)
      }

      // Pobieramy dane jako Buffer (ArrayBuffer w nowszych wersjach Node)
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Konwertujemy na Base64
      return buffer.toString('base64')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`Image encoding failed: ${msg}`)
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
        if (this.#checkCooldown()) {
          message.channel.sendTyping()
          try {
            const userInput = await this.prepareMessage(message)
            response = await this.model.chatWithChucha(userInput.msg, userInput.imgs)
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

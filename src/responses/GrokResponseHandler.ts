import { OmitPartialGroupDMChannel, Message, MessageFlags } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { getRandomFromArrRecursive } from '../utils/helpers'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'

class GrokResponseHandler extends BaseResponseHandler {
  #settings = {
    messages: [
      "Not what I'm called.",
    ]
  }

  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (message.content.toLowerCase().startsWith('@grok') && message.content.trim().endsWith('?')) {
      const response = getRandomFromArrRecursive(this.#settings.messages)
      ReplyHelper.respond(message, ResponseType.DELAY_REPLY, { content: response.choice, flags: MessageFlags.SuppressNotifications })
      this.logger.info('Replied to the grok message ', { author: message.author.displayName })
      return true
    }
    return false
  }
}

export default new GrokResponseHandler()

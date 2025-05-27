import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { getRandomFromArrRecursive } from '../utils/helpers'

class GrokResponseHandler extends BaseResponseHandler {
  #settings = {
    messages: [
      "Not what i'm called.",
    ]
  }

  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (message.content.toLowerCase().startsWith('@grok') && message.content.trim().endsWith('?')) {
      const response = getRandomFromArrRecursive(this.#settings.messages)
      message.reply({ content: response.choice })
      this.logger.info('Replied to the grok message ', { author: message.author.displayName })
      return true
    }
    return false
  }
}

export default new GrokResponseHandler()

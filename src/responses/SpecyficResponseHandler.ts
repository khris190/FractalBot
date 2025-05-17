import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { fuckerArr } from '../settings'
import { getRandomFromArrRecursive } from '../utils/helpers'
import Client from '../Client'

class SpecyficResponseHandler extends BaseResponseHandler {
  #settings = {
    responses: {
      w: fuckerArr
    },
  }

  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (Client.client.user?.id !== message.author.id) {
      for (const [key, responses] of Object.entries(this.#settings.responses)) {
        if (Array.isArray(responses)) {
          const response = getRandomFromArrRecursive(responses)
          if (message.content.toLowerCase() === key.toLowerCase()) {
            message.reply({ content: response })
            this.logger.info('Replied to the message ', { author: message.author.displayName, response })
            return true
          }
        }
      }
    }
    return false
  }
}

export default new SpecyficResponseHandler()

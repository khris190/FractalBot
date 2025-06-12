import { OmitPartialGroupDMChannel, Message, MessageFlags } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { fuckerArr } from '../settings'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import { MessageArr } from '../utils/MessageArr'

class SpecyficResponseHandler extends BaseResponseHandler {
  #settings = {
    responses: {
      w: new MessageArr(fuckerArr)
    },
  }

  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (Client.client.user?.id !== message.author.id) {
      for (const [key, responses] of Object.entries(this.#settings.responses)) {
        const response = responses.getRandom()
        if (message.content.toLowerCase() === key.toLowerCase()) {
          ReplyHelper.respond(message, ResponseType.DELAY_REPLY, { content: response.choice, flags: MessageFlags.SuppressNotifications })
          this.logger.info('Replied to the message ', { author: message.author.displayName, response })
          return true
        }
      }
    }
    return false
  }
}

export default new SpecyficResponseHandler()

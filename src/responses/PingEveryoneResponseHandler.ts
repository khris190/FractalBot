import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { fuckerArr } from '../settings'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import { MessageArr } from '../utils/MessageArr'

class PingEveryoneResponseHandler extends BaseResponseHandler {
  #settings = {
    messages: new MessageArr(fuckerArr)
  }

  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (Client.client.user?.id !== message.author.id && message.mentions.everyone) {
      const response = this.#settings.messages.getRandom()
      ReplyHelper.respond(message, ResponseType.DELAY_REPLY, { content: response.choice })
      this.logger.info('Replied to the @everyone message ', { author: message.author.displayName })
      return true
    }
    return false
  }
}

export default new PingEveryoneResponseHandler()

import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { fuckerArr } from '../settings'
import { getRandomFromArrRecursive } from '../utils/helpers'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'

class PingEveryoneResponseHandler extends BaseResponseHandler {
  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (Client.client.user?.id !== message.author.id && message.mentions.everyone) {
      const response = getRandomFromArrRecursive(fuckerArr)
      message.reply({ content: response.choice })
      ReplyHelper.respond(message, ResponseType.DELAY_REPLY, { content: response.choice })
      this.logger.info('Replied to the @everyone message ', { author: message.author.displayName })
      return true
    }
    return false
  }
}

export default new PingEveryoneResponseHandler()

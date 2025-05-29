import { OmitPartialGroupDMChannel, Message, MessageFlags } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { fuckerArr } from '../settings'
import { getRandomFromArrRecursive } from '../utils/helpers'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'

class RandomResponseHandler extends BaseResponseHandler {
  #settings = {
    chance: 0.004,
    messages: [
      fuckerArr,
      'White people be like',
      'nice',
      'Real, bestie',
      'Reminds me of high school',
      'Fake',
      ':(',
      ':)',
      'W',
      'Disco Elysium'
    ]
  }

  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (Math.random() < this.#settings.chance) {
      const response = getRandomFromArrRecursive(this.#settings.messages)
      ReplyHelper.respond(message, ResponseType.DELAY_REPLY, { content: response.choice, flags: MessageFlags.SuppressNotifications })
      this.logger.info('Replied to the message ', { author: message.author.displayName, response })
      return true
    }
    return false
  }
}

export default new RandomResponseHandler()

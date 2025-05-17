import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { fuckerArr } from '../settings'
import { getRandomFromArrRecursive } from '../utils/helpers'

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
      message.reply({ content: response })
      this.logger.info('Replied to the message ', { author: message.author.displayName, response })
      return true
    }
    return false
  }
}

export default new RandomResponseHandler()

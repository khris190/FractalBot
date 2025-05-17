import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { getRandomFromArrRecursive } from '../helpers'
import Client from '../Client'

class PingQuestionResponseHandler extends BaseResponseHandler {
  #settings = {
    messages: [
      'Real',
      'Fake',
      'Factual',
      'Farcical',
      'Yah',
      'Nah',
      'Truth lies only with the lord above, beyond reach of mortal grasp',
      'We may never know',
      'I guess',
      "Don't think so, buddy",
      'Plausible',
      'Dubious',
      'Doing dishes rn figure it out yourself',
      "Bruh I'm not the tooth fairy",
      'I could not care less',
      'Seek God',
      'What a terrible night to have a curse...',
      "Like that'll ever happen",
      "Turnips are fucking nasty if that's what you're asking",
      'Consult Romans 5:8',
      "The Pope is behind this but I won't say which one",
      'Chucha server error. Try again later.',
      "I'm in your walls",
      'Idk'
    ]
  }

  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (Client.client.user?.id !== message.author.id) {
      if (message.mentions.users.some((user, key, coll) => {
        return user.id === Client.client.user?.id
      })) {
        if (message.content.includes('?')) {
          const response = getRandomFromArrRecursive(this.#settings.messages)
          message.reply({ content: response })
          this.logger.info('Replied to the @ping message ', { author: message.author.displayName })
          return true
        }
      }
    }
    return false
  }
}

export default new PingQuestionResponseHandler()

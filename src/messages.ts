import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import { settings } from './settings'
import { getRandomFromArr } from './helpers'
import ILogger from './logger/ILogger'

export default class MessageHandler {
  logger: ILogger

  constructor (logger: ILogger) {
    this.logger = logger
  }

  #handleRandomResponses (message: OmitPartialGroupDMChannel<Message<boolean>>) {
    if (Math.random() < settings.RANDOM_MESSAGES.CHANCE) {
      const response = getRandomFromArr(settings.RANDOM_MESSAGES.MESSAGES)
      message.reply({ content: response })
      this.logger.info('Replied to the message ', { author: message.author.displayName, response })
    }
  }

  #handleSpecyficResponses (message: OmitPartialGroupDMChannel<Message<boolean>>) {
    for (const [key, responses] of Object.entries(settings.MESSAGE_RESPONSES)) {
      if (Array.isArray(responses)) {
        const response = getRandomFromArr(responses)
        if (message.content.toLowerCase() === key.toLowerCase()) {
          message.reply({ content: response })
          this.logger.info('Replied to the message ', { author: message.author.displayName, response })
          return true
        }
      }
    }
    return false
  }

  handleMessage (message: OmitPartialGroupDMChannel<Message<boolean>>) {
    this.#handleSpecyficResponses(message)
    this.#handleRandomResponses(message)
  }
}

import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import { settings } from './settings'
import { getRandomFromArrRecursive } from './helpers'
import ILogger from './logger/ILogger'
import Client from './Client'

export default class MessageHandler {
  logger: ILogger

  constructor (logger: ILogger) {
    this.logger = logger
  }

  #handleRandomResponses (message: OmitPartialGroupDMChannel<Message<boolean>>) {
    if (Math.random() < settings.RANDOM_MESSAGES.CHANCE) {
      const response = getRandomFromArrRecursive(settings.RANDOM_MESSAGES.MESSAGES)
      message.reply({ content: response })
      this.logger.info('Replied to the message ', { author: message.author.displayName, response })
    }
  }

  #handleSpecyficResponses (message: OmitPartialGroupDMChannel<Message<boolean>>) {
    if (Client.client.user?.id !== message.author.id) {
      for (const [key, responses] of Object.entries(settings.MESSAGE_RESPONSES)) {
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

  handleMessage (message: OmitPartialGroupDMChannel<Message<boolean>>) {
    this.#handleSpecyficResponses(message)
    this.#handleRandomResponses(message)
  }
}

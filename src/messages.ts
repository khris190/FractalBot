import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import { settings } from './settings'
import { getRandomFromArr } from './helpers'

export default function handleRandomResponses (message: OmitPartialGroupDMChannel<Message<boolean>>) {
  if (Math.random() < settings.RANDOM_MESSAGES.CHANCE) {
    message.reply({ content: getRandomFromArr(settings.RANDOM_MESSAGES.MESSAGES) })
  }
}

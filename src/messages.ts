import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import { settings } from './settings'
import { getRandomFromArr } from './helpers'

export default function handleRandomResponses (message: OmitPartialGroupDMChannel<Message<boolean>>) {
  if (Math.random() < settings.RANDOM_MESSAGES.CHANCE) {
    message.reply({ content: getRandomFromArr(settings.RANDOM_MESSAGES.MESSAGES) })
  }
}

export function handleSpecyficResponses (message: OmitPartialGroupDMChannel<Message<boolean>>) {
  for (const [key, val] of Object.entries(settings.MESSAGE_RESPONSES)) {
    if (Array.isArray(val)) {
      if (message.content.toLowerCase() === key.toLowerCase()) {
        message.reply({
          content: getRandomFromArr(val)
        })
        return true
      }
    }
  }
  return false
}

import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import { MessageArr } from '../utils/MessageArr'
import { GuildData } from '../utils/db/schema'
import db from '../utils/db/db'
import { eq } from 'drizzle-orm'

class PingQuestionResponseHandler extends BaseResponseHandler {
  #settings = {
    cooldownMs: 1000 * 60 * 60 * 36,
    cooldownMessage: 'Never again',
    messages: new MessageArr([
      ['Granted', 4],
      ['I sense a loophole', 11],
      ['Denied', 85],
    ])
  }

  #checkCooldown (guildId:string, cooldown = this.#settings.cooldownMs):boolean {
    const time = new Date().getTime()
    const lastWishTS = db.select().from(GuildData).where(eq(GuildData.id, guildId ?? '')).get()?.lastWishTimeStamp ?? 0
    if (lastWishTS + cooldown < time) {
      db.insert(GuildData)
        .values({ id: guildId, lastWishTimeStamp: time })
        .onConflictDoUpdate({ target: GuildData.id, set: { lastWishTimeStamp: time } }).then(res => console.log(res))
      return true
    }
    return false
  }

  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (Client.client.user?.id !== message.author.id) {
      if (message.mentions.users.some((user, key, coll) => {
        return user.id === Client.client.user?.id
      })) {
        if (message.content.replace(/<@\d+>/, '').toLowerCase().trim().startsWith('i wish')) {
          let response = this.#settings.cooldownMessage
          if (this.#checkCooldown(message.guildId ?? '')) {
            const res = this.#settings.messages.getRandom()
            response = res.choice
          }
          ReplyHelper.respond(message, ResponseType.DELAY_SAME_CHANNEL, { content: response })
          // message.reply({ content: response, flags: MessageFlags.SuppressNotifications })
          this.logger.info('Replied to the @ping wish ', { author: message.author.displayName })
          return true
        }
      }
    }
    return false
  }
}

export default new PingQuestionResponseHandler()

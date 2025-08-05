import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import Client from '../Client'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import { MessageArr } from '../utils/MessageArr'
import { GuildData } from '../utils/db/schema'
import db from '../utils/db/db'
import { eq } from 'drizzle-orm'
import SimilarityChecker from '../utils/SimilarityChecker'
import { log } from 'node:console'

class PingQuestionResponseHandler extends BaseResponseHandler {
  similarityChecker: SimilarityChecker
  #settings = {
    // cooldownMs: 1000 * 60 * 60 * 36,
    // cooldownMs: 1000 * 60 * 60 * 4.8,
    cooldownMs: 1000,
    cooldownMessage: 'Never again',
    messages: new MessageArr([
      ['Granted', 5, 2],
      ['I sense a loophole', 11],
      ['Denied', 84],
    ]),
    getCreativeMsg: 'Denied. Get more creative, fleshbag.'
  }

  constructor () {
    super()
    this.similarityChecker = new SimilarityChecker(this.logger)
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

  async _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): Promise<boolean> {
    if (Client.client.user?.id !== message.author.id) {
      if (message.mentions.users.some((user, key, coll) => {
        return user.id === Client.client.user?.id
      })) {
        if (message.content.replace(/<@\d+>/, '').toLowerCase().trim().startsWith('i wish')) {
          let response = this.#settings.cooldownMessage
          if (this.#checkCooldown(message.guildId ?? '')) {
            if (await this.similarityChecker.checkSimilarity(
              message.content.replace(/<@\d+>/, '').toLowerCase().trim() + ' #' + message.member?.nickname)
            ) {
              const res = this.#settings.messages.getRandom()
              response = res.choice
            } else {
              response = this.#settings.getCreativeMsg
            }
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

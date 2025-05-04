import { sql } from 'drizzle-orm'
import { Client } from '../Client'
import db from '../db/db'
import { imageChannel } from '../db/schema'
import { TextChannel } from 'discord.js'
import path from 'path'
import env from '../env'
import BaseInterval from './BaseInterval'
import ILogger from '../logger/ILogger'

export default class randomImageInterval extends BaseInterval {
  async run (self: Client, logger: ILogger) {
    if (Math.random() <= 0.00015) {
      const channel = db.select().from(imageChannel).orderBy(sql`RANDOM()`).limit(1).get()
      if (channel && self.client) {
        const chan = self.client.channels.cache.get(channel.channelId) as TextChannel
        chan.send({ files: [{ attachment: path.resolve(env.DATA_PATH, 'images', 'suprise.jpg') }] })
      }
    }
  }
}

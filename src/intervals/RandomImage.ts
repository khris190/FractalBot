import { sql } from 'drizzle-orm'
import { Client } from '../Client'
import db from '../utils/db/db'
import { ImageChannel } from '../utils/db/schema'
import { TextChannel } from 'discord.js'
import path from 'path'
import env from '../utils/env'
import BaseInterval from './BaseInterval'
import ILogger from '../utils/logger/ILogger'

class RandomImageInterval extends BaseInterval {
  async run (self: Client, logger: ILogger) {
    if (Math.random() <= 0.00008) {
      logger.info('sending the image')
      const channel = db.select().from(ImageChannel).orderBy(sql`RANDOM()`).limit(1).get()
      logger.info('to channel:', channel)
      if (channel && self.client) {
        const chan = self.client.channels.cache.get(channel.channelId) as TextChannel
        chan.send({ files: [{ attachment: path.resolve(env.DATA_PATH, 'images', 'suprise.jpg') }] })
      }
    }
  }
}
const interval = new RandomImageInterval()
export default interval

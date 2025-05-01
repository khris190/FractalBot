import { Client as DiscordClient, GatewayIntentBits } from 'discord.js'
import handleRandomResponses, { handleSpecyficResponses } from './messages'
import env from './env'
import db from './db/db'
import { imageChannels } from './db/schema'
import { eq } from 'drizzle-orm'

export default class Client {
  client
  constructor () {
    this.client = new DiscordClient({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })

    this.client.on('ready', () => {
      if (this.client.user) {
        console.log(`Logged in as ${this.client.user.tag}!`)
        this.client.user.setActivity('M*th')
      } else {
        throw new Error('Unable to log in.')
      }
    })

    this.client.on('messageCreate', async message => {
      handleSpecyficResponses(message)
      handleRandomResponses(message)
    })
  }

  start () {
    this.client.login(env.TOKEN)
    const x = db.select({ ajDi: imageChannels.id }).from(imageChannels).where(eq(imageChannels.id, 1))
    console.log(x.get())
  }
}

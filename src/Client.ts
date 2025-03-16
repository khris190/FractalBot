import { Client as DiscordClient, GatewayIntentBits } from 'discord.js'
import { settings } from './settings'
import handleRandomResponses from './messages'

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
      handleRandomResponses(message)
    })
  }

  start () {
    this.client.login(settings.TOKEN)
  }
}

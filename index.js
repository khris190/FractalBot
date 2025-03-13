import { Client, GatewayIntentBits } from 'discord.js'
import { settings } from './settings.js'
import { getRandomFromArr } from './helpers.js'

process.on('SIGINT', () => {
  console.log('terminating gracefully')
  process.exit(0)
})

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
  client.user.setActivity('Burning The Fucking Casino Down')
})

client.on('messageCreate', async message => {
  if (Math.random() < 0.011) {
    message.reply({ content: getRandomFromArr(settings.MESSAGES) })
  }
})

client.login(settings.TOKEN)

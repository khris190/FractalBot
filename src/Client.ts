import { Collection, Client as DiscordClient, Events, GatewayIntentBits, Interaction, MessageFlags, REST, Routes } from 'discord.js'
import env from './utils/env'
import path from 'path'
import { readdirSync } from 'fs'
import { Defer } from './utils/helpers'
import ILogger from './utils/logger/ILogger'
import getLogger from './utils/logger/getLogger'
import RandomImageInterval from './intervals/RandomImage'
import MessageHandler from './messages'

export class Client {
  client
  commands: Collection<string, { execute: (interaction:Interaction)=>Promise<void> }>
  ready: Defer<void>
  intervals: NodeJS.Timeout[] = []
  logger: ILogger
  messageHandler: MessageHandler
  constructor (logger: ILogger) {
    this.logger = logger
    this.ready = new Defer()
    this.client = new DiscordClient({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
    })
    this.commands = new Collection()
    this.messageHandler = new MessageHandler(this.logger)
    this.logger.notice('Preparing client events')
    this.prepareClientEvents()
    this.logger.notice('Preparing commands')
    this.prepareCommands()
    this.logger.notice('Creating intrervals')
    this.createIntervals()
  }

  prepareClientEvents () {
    this.client.on('ready', () => {
      if (this.client.user) {
        this.logger.info(`Logged in as ${this.client.user.tag}!`)
        this.ready.resolve()
        this.client.user.setActivity('M*th')
      } else {
        this.logger.error('Unable to log in')
        this.ready.reject()
        throw new Error('Unable to log in.')
      }
    })

    this.client.on('messageCreate', async message => {
      try {
        this.messageHandler.handleMessage(message)
      } catch (e:any) {
        this.logger.error('messageCreate error', e)
      }
    })

    this.client.on(Events.InteractionCreate, async interaction => {
      if (!interaction.isChatInputCommand()) return

      const command = this.commands.get(interaction.commandName)

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`)
        return
      }

      try {
        await command.execute(interaction)
      } catch (error) {
        console.error(error)
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral })
        } else {
          await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral })
        }
      }
    })
  }

  prepareCommands () {
    const commands = []
    const commandsPath = path.join(__dirname, 'commands')

    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('Command.ts'))
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file)
      const command = require(filePath)
      if ('data' in command && 'execute' in command) {
        this.commands.set(command.data.name, command)
        commands.push(command.data.toJSON())
      } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`)
      }
    }

    const rest = new REST().setToken(env.TOKEN ?? '');

    (async () => {
      try {
        this.logger.info(`Started refreshing ${commands.length} application (/) commands.`)

        const data = await rest.put(
          Routes.applicationCommands(env.CLIENT_ID ?? ''),
          { body: commands }
        ) as any

        this.logger.info(`Successfully reloaded ${data.length} application (/) commands.`)
      } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error)
      }
    })()
  }

  createIntervals () {
    // TODO: this seems stupid
    this.intervals.push(setInterval((new RandomImageInterval()).callback, 60 * 1000, this, this.logger))
  }

  async start () {
    this.client.login(env.TOKEN)
    await this.ready
  }
}

export default new Client(getLogger('client'))

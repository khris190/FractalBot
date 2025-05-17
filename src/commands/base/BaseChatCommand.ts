import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel } from 'discord.js'
import env from '../../utils/env'
import getLogger from '../../utils/logger/getLogger'
import UnknownGuildError from '../../utils/errors/UnknownGuildError'
import client from '../../Client'

const commandLogger = getLogger('commands')

export default abstract class BaseChatCommand {
  data
  logger = commandLogger
  constructor (name:string, desc: string) {
    this.data = new SlashCommandBuilder()
      .setName(name)
      .setDescription(desc)
  }

  async execute (interaction: ChatInputCommandInteraction) {
    this.logger.info(`${interaction.user.username} called ${this.data.name}`)
    try {
      if (interaction.guildId === env.GUILD_ID) {
        if (interaction instanceof ChatInputCommandInteraction) {
          this.run(interaction)
        }
      } else {
        client.client.guilds.cache.get(interaction.guildId ?? '')?.leave()
        throw new UnknownGuildError()
      }
    } catch (e: any) {
      this.logger.error('command error', {
        guildName: interaction.guild?.name,
        channelName: (interaction.channel as TextChannel).name,
        e
      })
    }
  }

  abstract run (interaction: ChatInputCommandInteraction):Promise<void>
}

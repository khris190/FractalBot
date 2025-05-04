import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import env from '../../env'
import getLogger from '../../logger/getLogger'
import UnknownGuildError from '../../errors/UnknownGuildError'

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
        throw new UnknownGuildError()
      }
    } catch (e: any) {
      this.logger.error('command error', { interaction, e })
    }
  }

  abstract run (interaction: ChatInputCommandInteraction):Promise<void>
}

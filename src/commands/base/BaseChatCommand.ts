import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import env from '../../env'

export default abstract class BaseChatCommand {
  data
  constructor (name:string, desc: string) {
    this.data = new SlashCommandBuilder()
      .setName(name)
      .setDescription(desc)
  }

  async execute (interaction: ChatInputCommandInteraction) {
    if (interaction.guildId === env.GUILD_ID) {
      if (interaction instanceof ChatInputCommandInteraction) {
        this.run(interaction)
      }
    }
  }

  abstract run (interaction: ChatInputCommandInteraction):Promise<void>
}

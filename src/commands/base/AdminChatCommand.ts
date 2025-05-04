import { ChatInputCommandInteraction } from 'discord.js'
import BaseChatCommand from './BaseChatCommand'
import { settings } from '../../settings'

export default abstract class AdminChatCommand extends BaseChatCommand {
  async execute (interaction: ChatInputCommandInteraction) {
    if (settings.ADMINS.includes(interaction.user.id)) {
      super.execute(interaction)
    }
  }
}

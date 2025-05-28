import { ChatInputCommandInteraction } from 'discord.js'
import BaseChatCommand from './BaseChatCommand'
import { settings } from '../../settings'
import { hiddenInteractionReply } from '../../utils/helpers'

export default abstract class AdminChatCommand extends BaseChatCommand {
  async execute (interaction: ChatInputCommandInteraction) {
    if (settings.ADMINS.includes(interaction.user.id)) {
      super.execute(interaction)
    } else {
      this.logger.info(`${interaction.user.username} tried to run ${interaction.commandName}`)
      hiddenInteractionReply(interaction, 'ACCESS DENIED. LEVEL 5 SECURITY CLEARANCE REQUIRED.')
    }
  }
}

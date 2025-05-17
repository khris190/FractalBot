import { ChatInputCommandInteraction, TextChannel } from 'discord.js'
import db from '../utils/db/db'
import { imageChannel } from '../utils/db/schema'
import { eq } from 'drizzle-orm'
import AdminChatCommand from './base/AdminChatCommand'
import { hiddenReply } from '../utils/helpers'

class ToggleImageWhitelistCommand extends AdminChatCommand {
  async run (interaction: ChatInputCommandInteraction): Promise<void> {
    const channelId = interaction.channelId
    const channel = db.select()
      .from(imageChannel)
      .where(eq(imageChannel.channelId, channelId))
      .get()
    const channelName = (interaction.channel as TextChannel).name
    if (channel) {
      this.logger.info(`Removing ${(interaction.channel as TextChannel).name} from imageChannel table`)
      const delResult = await db.delete(imageChannel)
        .where(eq(imageChannel.channelId, channelId))
      if (delResult.changes) {
        hiddenReply(interaction, 'Removed: ' + channelName)
      }
    } else {
      this.logger.info(`Adding ${(interaction.channel as TextChannel).name} to imageChannel table`)
      await db.insert(imageChannel).values({ channelId, name: channelName })
      hiddenReply(interaction, 'Added: ' + channelName)
    }
  }
}

module.exports = new ToggleImageWhitelistCommand('catdeploymentmode', 'Cat Mode')

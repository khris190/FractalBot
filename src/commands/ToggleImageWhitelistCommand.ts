import { ChatInputCommandInteraction, TextChannel } from 'discord.js'
import db from '../utils/db/db'
import { ImageChannel } from '../utils/db/schema'
import { eq } from 'drizzle-orm'
import AdminChatCommand from './base/AdminChatCommand'
import { hiddenInteractionReply } from '../utils/helpers'

class ToggleImageWhitelistCommand extends AdminChatCommand {
  constructor () {
    super('catdeploymentmode', 'Cat Mode')
  }

  async run (interaction: ChatInputCommandInteraction): Promise<void> {
    const channelId = interaction.channelId
    const channel = db.select()
      .from(ImageChannel)
      .where(eq(ImageChannel.channelId, channelId))
      .get()
    const channelName = (interaction.channel as TextChannel).name
    if (channel) {
      this.logger.info(`Removing ${(interaction.channel as TextChannel).name} from imageChannel table`)
      const delResult = await db.delete(ImageChannel)
        .where(eq(ImageChannel.channelId, channelId))
      if (delResult.changes) {
        hiddenInteractionReply(interaction, 'Removed: ' + channelName)
      }
    } else {
      this.logger.info(`Adding ${(interaction.channel as TextChannel).name} to imageChannel table`)
      await db.insert(ImageChannel).values({ channelId, name: channelName })
      hiddenInteractionReply(interaction, 'Added: ' + channelName)
    }
  }
}

module.exports = new ToggleImageWhitelistCommand()

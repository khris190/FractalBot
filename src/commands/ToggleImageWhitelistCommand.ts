import { ChatInputCommandInteraction, TextChannel } from 'discord.js'
import db from '../db/db'
import { imageChannel } from '../db/schema'
import { eq } from 'drizzle-orm'
import AdminChatCommand from './base/AdminChatCommand'
import { hiddenReply } from '../helpers'

class ToggleImageWhitelistCommand extends AdminChatCommand {
  async run (interaction: ChatInputCommandInteraction): Promise<void> {
    const channelId = interaction.channelId
    const channel = db.select()
      .from(imageChannel)
      .where(eq(imageChannel.channelId, channelId))
      .get()
    if (channel) {
      const delResult = await db.delete(imageChannel)
        .where(eq(imageChannel.channelId, channelId))
      if (delResult.changes) {
        console.log(delResult)
        hiddenReply(interaction, 'Removed: ' + (interaction.channel as TextChannel).name)
      }
    } else {
      await db.insert(imageChannel).values({ channelId })
      hiddenReply(interaction, 'Added: ' + (interaction.channel as TextChannel).name)
    }
  }
}

module.exports = new ToggleImageWhitelistCommand('catdeploymentmode', 'Cat Mode')

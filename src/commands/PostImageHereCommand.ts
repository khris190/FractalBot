import { ChatInputCommandInteraction, TextChannel } from 'discord.js'
import AdminChatCommand from './base/AdminChatCommand'
import client from '../Client'
import path from 'node:path'
import env from '../utils/env'
import { hiddenInteractionReply } from '../utils/helpers'

class ToggleImageWhitelistCommand extends AdminChatCommand {
  constructor () { super('imdebug', 'Cat') }
  async run (interaction: ChatInputCommandInteraction): Promise<void> {
    const channelId = interaction.channelId
    const chan = client.client.channels.cache.get(channelId) as TextChannel
    chan.send({ files: [{ attachment: path.resolve(env.DATA_PATH, 'images', 'suprise.jpg') }] })
    hiddenInteractionReply(interaction, 'Done.')
  }
}

module.exports = new ToggleImageWhitelistCommand()

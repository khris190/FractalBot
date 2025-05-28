import { ChatInputCommandInteraction, TextChannel } from 'discord.js'
import AdminChatCommand from './base/AdminChatCommand'
import client from '../Client'
import { hiddenInteractionReply } from '../utils/helpers'

class WriteStuffHereCommand extends AdminChatCommand {
  constructor () {
    super('arbitrarytenets', 'tenets')
    this.data.addStringOption(option =>
      option.setName('stuff').setDescription('test').setRequired(true)
    )
  }

  async run (interaction: ChatInputCommandInteraction): Promise<void> {
    const channelId = interaction.channelId
    const content = interaction.options.getString('stuff')
    if (content) {
      const chan = client.client.channels.cache.get(channelId) as TextChannel
      chan.sendTyping()
      setTimeout(function () {
        chan.send({ content })
      }, 10000)
    }
    hiddenInteractionReply(interaction, 'Done.')
  }
}

module.exports = new WriteStuffHereCommand()

import { ChatInputCommandInteraction, TextChannel } from 'discord.js'
import AdminChatCommand from './base/AdminChatCommand'
import client from '../Client'
import { hiddenInteractionReply } from '../utils/helpers'
import ReplyHelper from '../utils/ReplyHelper'

const strOptionName = 'policy_definition_set'

class WriteStuffHereCommand extends AdminChatCommand {
  constructor () {
    super('arbitrarytenets', 'tenets')
    this.data.addStringOption(option =>
      option.setName(strOptionName).setDescription('test').setRequired(true)
    )
  }

  async run (interaction: ChatInputCommandInteraction): Promise<void> {
    const channelId = interaction.channelId
    const content = interaction.options.getString(strOptionName)
    hiddenInteractionReply(interaction, 'Done.')
    if (content) {
      const chan = client.client.channels.cache.get(channelId) as TextChannel
      ReplyHelper.delayedSendToChannel(chan, { content })
    }
  }
}

module.exports = new WriteStuffHereCommand()

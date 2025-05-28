import { ChatInputCommandInteraction, TextChannel } from 'discord.js'
import AdminChatCommand from './base/AdminChatCommand'
import client from '../Client'
import { hiddenInteractionReply, sleep } from '../utils/helpers'

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
    hiddenInteractionReply(interaction, 'Done.')
    if (content) {
      const chan = client.client.channels.cache.get(channelId) as TextChannel
      (async () => {
        await sleep(1000)
        chan.sendTyping()
        await sleep(8500)
        chan.send({ content })
      })()
    }
  }
}

module.exports = new WriteStuffHereCommand()

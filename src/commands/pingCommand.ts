import { ChatInputCommandInteraction } from 'discord.js'
import BaseChatCommand from './base/BaseChatCommand'
import { hiddenInteractionReply } from '../utils/helpers'

class PingCommand extends BaseChatCommand {
  constructor () {
    super('ping', 'test')
  }

  async run (interaction: ChatInputCommandInteraction): Promise<void> {
    hiddenInteractionReply(interaction, 'Pong')
  }
}

module.exports = new PingCommand()

import { ChatInputCommandInteraction } from 'discord.js'
import BaseChatCommand from './base/BaseChatCommand'
import { hiddenReply } from '../utils/helpers'

class PingCommand extends BaseChatCommand {
  async run (interaction: ChatInputCommandInteraction): Promise<void> {
    hiddenReply(interaction, 'Pong')
  }
}

module.exports = new PingCommand('ping', 'test')

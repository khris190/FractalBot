import { ChatInputCommandInteraction } from 'discord.js'
import AdminChatCommand from './base/AdminChatCommand'
import LLMPingResponseHandler from '../responses/LLMPingResponseHandler'
import { status } from '../utils/status'

class RememberCommand extends AdminChatCommand {
  constructor () {
    super('remember', 'Compress short-term conversations into long-term memory')
  }

  async run (interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply()

    const model = LLMPingResponseHandler.model
    // No busy-wait needed — consolidateMemory runs through the Model's single-flight queue.
    status.beginDreaming()
    try {
      await interaction.editReply('Compressing memory... this might take a while')
      await model.consolidateMemory()
      await interaction.editReply('Memory consolidated.')
    } catch (error) {
      this.logger.error('remember command error', error as Error)
      await interaction.editReply('Failed to consolidate memory. Check logs.')
    } finally {
      status.endDreaming()
    }
  }
}

module.exports = new RememberCommand()

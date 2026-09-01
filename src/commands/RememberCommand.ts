import { ChatInputCommandInteraction } from 'discord.js'
import AdminChatCommand from './base/AdminChatCommand'
import LLMPingResponseHandler from '../responses/LLMPingResponseHandler'

class RememberCommand extends AdminChatCommand {
  constructor () {
    super('remember', 'Compress short-term conversations into long-term memory')
  }

  async run (interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply()

    const model = LLMPingResponseHandler.model
    // Wait for the model to be free (it's single-flight and slow)
    while (model.busy) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    try {
      await interaction.editReply('Compressing memory... this might take a while')
      await model.consolidateMemory()
      await interaction.editReply('Memory consolidated.')
    } catch (error) {
      this.logger.error('remember command error', error as Error)
      await interaction.editReply('Failed to consolidate memory. Check logs.')
    }
  }
}

module.exports = new RememberCommand()

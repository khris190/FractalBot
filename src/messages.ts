import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import ILogger from './logger/ILogger'
import PingEveryoneResponseHandler from './responses/PingEveryoneResponseHandler'
import PingQuestionResponseHandler from './responses/PingQuestionResponseHandler'
import SpecyficResponseHandler from './responses/SpecyficResponseHandler'
import RandomResponseHandler from './responses/RandomResponseHandler'

export default class MessageHandler {
  logger: ILogger

  constructor (logger: ILogger) {
    this.logger = logger
  }

  handleMessage (message: OmitPartialGroupDMChannel<Message<boolean>>) {
    if (PingEveryoneResponseHandler.handleMessage(message)) return
    if (PingQuestionResponseHandler.handleMessage(message)) return
    SpecyficResponseHandler.handleMessage(message)
    RandomResponseHandler.handleMessage(message)
  }
}

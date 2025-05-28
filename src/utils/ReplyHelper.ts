import { OmitPartialGroupDMChannel, Message, MessageReplyOptions } from 'discord.js'
import getLogger from './logger/getLogger'
import { sleep } from './helpers'

export enum ResponseType {
  REPLY,
  SAME_CHANNEL,
  DELAY_REPLY,
  DELAY_SAME_CHANNEL,
}
export default class ReplyHelper {
  private static logger = getLogger('ReplyHelper', false)
  static respond (message: OmitPartialGroupDMChannel<Message<boolean>>, type:ResponseType, payload:MessageReplyOptions) {
    switch (type) {
      case ResponseType.REPLY:
        this.reply(message, payload)
        break
      case ResponseType.SAME_CHANNEL:
        this.sameChannelReply(message, payload)
        break
      case ResponseType.DELAY_REPLY:
        this.delayedReply(message, payload)
        break
      case ResponseType.DELAY_SAME_CHANNEL:
        this.delayedSameChannelReply(message, payload)
        break
      default:
        this.logger.error(`Unknown response type: ${type}`)
        break
    }
  }

  private static reply (message: OmitPartialGroupDMChannel<Message<boolean>>, payload:MessageReplyOptions) {
    message.reply(payload)
  }

  private static sameChannelReply (message: OmitPartialGroupDMChannel<Message<boolean>>, payload:MessageReplyOptions) {
    message.channel.send(payload)
  }

  private static async delayedReply (message: OmitPartialGroupDMChannel<Message<boolean>>, payload:MessageReplyOptions) {
    await sleep(1000)
    message.channel.sendTyping()
    await sleep(this.calculateDelayMs(payload.content ?? ''))
    this.reply(message, payload)
  }

  private static async delayedSameChannelReply (message: OmitPartialGroupDMChannel<Message<boolean>>, payload:MessageReplyOptions) {
    await sleep(1000)
    message.channel.sendTyping()
    await sleep(this.calculateDelayMs(payload.content ?? ''))
    this.sameChannelReply(message, payload)
  }

  private static calculateDelayMs (message:string) {
    const delay = message.length * 50
    return Math.min(delay, 9500) + 500
  }
}

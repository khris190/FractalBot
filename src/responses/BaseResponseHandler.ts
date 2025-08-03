import { Message, OmitPartialGroupDMChannel } from 'discord.js'
import getLogger from '../utils/logger/getLogger'

const responseLogger = getLogger('responses')
export default abstract class BaseResponseHandler {
  logger = responseLogger
  async handleMessage (message: OmitPartialGroupDMChannel<Message<boolean>>) :Promise<boolean> {
    return await this._handle(message) ?? false
  }
  abstract _handle (message: OmitPartialGroupDMChannel<Message<boolean>>):boolean | null | Promise<boolean | null>
}

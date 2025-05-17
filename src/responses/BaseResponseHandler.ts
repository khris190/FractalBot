import { Message, OmitPartialGroupDMChannel } from 'discord.js'
import getLogger from '../logger/getLogger'

const responseLogger = getLogger('responses')
export default abstract class BaseResponseHandler {
  logger = responseLogger
  handleMessage (message: OmitPartialGroupDMChannel<Message<boolean>>) :boolean {
    return this._handle(message) ?? false
  }
  abstract _handle (message: OmitPartialGroupDMChannel<Message<boolean>>):boolean | null
}

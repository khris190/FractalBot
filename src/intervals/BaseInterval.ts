import { Client } from '../Client'
import ILogger from '../utils/logger/ILogger'

export default abstract class BaseInterval {
  abstract run (self:Client, logger:ILogger): Promise<void>

  callback (self:Client, logger: ILogger) {
    try {
      this.run(self, logger)
    } catch (e) {

    }
  }
}

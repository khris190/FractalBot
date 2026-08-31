import env from './env'
import ILogger from './logger/ILogger'

export default class SimilarityChecker {
  logger: ILogger
  constructor (logger:ILogger) {
    this.logger = logger
  }

  async checkSimilarity (sentence:string) {
    const start = new Date().getTime()
    let result = 2
    try {
      // 'treshold' is the wire key expected by python/server.py — keep as-is
      const body = JSON.stringify({ sentence, treshold: env.SIMILARITY_THRESHOLD })
      const response = await fetch(env.SIMILARITY_ENDPOINT, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body
      })
      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`)
      }
      result = await response.json()
    } catch (error: any) {
      this.logger.error(error.message)
    }
    this.logger.info('SimilarityChecker execution', { res: result, duration: new Date().getTime() - start })
    return result < env.SIMILARITY_THRESHOLD
  }
}

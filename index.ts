import client from './src/Client'
import getLogger from './src/utils/logger/getLogger'

const logger = getLogger('main')
const interruptCodes = ['SIGTERM', 'SIGINT']
interruptCodes.forEach((code) => {
  process.on(code, () => {
    logger.info('terminating gracefully')
    // if i ever need to await something before killing the docker container
    process.exit(0)
  })
})
try {
  client.start()
} catch (e:any) { logger.error('ERROR STARTING', e) }

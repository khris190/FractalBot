import client from './src/Client'
import getLogger from './src/logger/getLogger'

const logger = getLogger('main')
const interruptCodes = ['SIGTERM', 'SIGINT']
interruptCodes.forEach((code) => {
  process.on(code, () => {
    logger.info('terminating gracefully')
    // if i ever need to await something before killing the docker container
    process.exit(0)
  })
})

client.start()

import client from './src/Client'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
if (!existsSync('/app/data')) { mkdirSync('/app/data') }
appendFileSync('/app/data/file.txt', 'hi')
const interruptCodes = ['SIGTERM', 'SIGINT']
interruptCodes.forEach((code) => {
  process.on(code, () => {
    console.log('terminating gracefully')
    // if i ever need to await something before killing the docker container
    process.exit(0)
  })
})

client.start()

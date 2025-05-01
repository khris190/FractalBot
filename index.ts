import Client from './src/Client'

const interruptCodes = ['SIGTERM', 'SIGINT']
interruptCodes.forEach((code) => {
  process.on(code, () => {
    console.log('terminating gracefully')
    // if i ever need to await something before killing the docker container
    process.exit(0)
  })
})

const client = new Client()
client.start()

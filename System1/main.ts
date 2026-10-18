import { CONVERSATIONS } from './testData'
import { PROMPTS, runConversation } from './runner'

async function main (): Promise<void> {
  const allLatencies: number[] = []

  console.log(`Prompts: ${PROMPTS.map(p => p.name).join('  |  ')}`)
  console.log('Endpoints: A=12345  B=12346')
  console.log('Threshold: >= 0.5 = handoff')

  for (const conv of CONVERSATIONS) {
    await runConversation(conv, allLatencies)
  }

  const min = Math.min(...allLatencies)
  const max = Math.max(...allLatencies)
  const avg = allLatencies.reduce((sum, l) => sum + l, 0) / allLatencies.length

  console.log('')
  console.log(
    `Total: ${allLatencies.length} decisions | min ${min.toFixed(0)} ms / avg ${avg.toFixed(0)} ms / max ${max.toFixed(0)} ms`
  )
}

main().catch((error: unknown) => {
  console.error('[FAIL]', error instanceof Error ? error.message : error)
  process.exitCode = 1
})

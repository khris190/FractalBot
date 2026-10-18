import type { SystemOneResponse } from './types'
import { SERVER_URL_A, SERVER_URL_B } from './config'

interface ModelResult {
  handoff: boolean;
  score: number;
  modelLabel: string;
}

async function decideOne (prompt: string, eventContext: string, url: string): Promise<ModelResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: `live conversation\n\n${eventContext}`,
      questions: {
        handoff: {
          type: 'choice',
          instructions: prompt,
          criteria: {
            true: 'the bigger AI should take the turn to reply',
            false: 'the user is still talking or the thought is incomplete',
          },
        },
      },
    }),
  })

  if (!response.ok) throw new Error(`Server error: ${response.status} ${response.statusText}`)

  const data: SystemOneResponse = await response.json()
  const answer = data.answers.handoff
  if (!answer) throw new Error('Missing answer')

  const label = data.model ?? url
  let score: number
  if (answer.type === 'choice' && answer.probabilities) {
    score = answer.probabilities.true
  } else {
    score = 'noul' in answer ? answer.noul : 'score' in answer ? answer.score : 0
  }
  return { handoff: score >= 0.5, score, modelLabel: label }
}

/** Call both models for one prompt + event context. Returns { a, b }. */
export async function decideHandoff (
  prompt: string,
  eventContext: string
): Promise<{ a: ModelResult; b: ModelResult }> {
  const [a, b] = await Promise.all([
    decideOne(prompt, eventContext, SERVER_URL_A),
    decideOne(prompt, eventContext, SERVER_URL_B),
  ])
  return { a, b }
}

import type { Conversation } from './types'

// Test data: casual conversations, realistic speech timing.
// Words land 200-350 ms apart within a phrase; people pause 700-1000 ms
// between thoughts (sometimes mid-sentence) and stop for 1.5-2.5 s at the end.
export const CONVERSATIONS: Conversation[] = [
  {
    name: 'casual chat, ends on a statement',
    trailingSilenceMs: 2000,
    words: [
      { t: 0, word: 'hey' },
      { t: 250, word: 'so' },
      { t: 800, word: 'what' },
      { t: 1050, word: 'are' },
      { t: 1300, word: 'you' },
      { t: 1550, word: 'up' },
      { t: 2350, word: 'to' },
      { t: 2600, word: 'lately' },
      { t: 2900, word: 'anyway' },
      { t: 3700, word: 'just' },
      { t: 4000, word: 'watching' },
      { t: 4300, word: 'some' },
      { t: 4600, word: 'old' },
      { t: 4900, word: 'movies' },
    ],
  },
  {
    name: 'direct question, waits for an answer',
    trailingSilenceMs: 2500,
    words: [
      { t: 0, word: 'quick' },
      { t: 250, word: 'question' },
      { t: 1100, word: 'do' },
      { t: 1350, word: 'you' },
      { t: 1600, word: 'think' },
      { t: 1850, word: 'it' },
      { t: 2150, word: 'll' },
      { t: 2400, word: 'rain' },
      { t: 2700, word: 'tomorrow' },
    ],
  },
  {
    name: 'rambling with mid-sentence pauses',
    trailingSilenceMs: 1800,
    words: [
      { t: 0, word: 'um' },
      { t: 300, word: 'so' },
      { t: 1300, word: 'i' },
      { t: 1550, word: 'was' },
      { t: 1800, word: 'thinking' },
      { t: 2800, word: 'maybe' },
      { t: 3100, word: 'we' },
      { t: 3400, word: 'should' },
      { t: 3700, word: 'go' },
      { t: 4600, word: 'the' },
      { t: 4900, word: 'one' },
      { t: 5200, word: 'by' },
      { t: 5450, word: 'the' },
      { t: 5700, word: 'river' },
    ],
  },
]

// One spoken word with the moment it was said.
export interface WordEvent {
  t: number; // ms since the conversation started
  word: string;
}

// What the handler emits and the decision LLM reacts to.
export interface SpeechEvent {
  kind: 'speech';
  index: number;
  t: number; // ms of the first word in the microturn
  words: string[];
}

export interface SilenceEvent {
  kind: 'silence';
  index: number;
  t: number; // ms of this silence tick
  duration: number; // cumulative ms of silence so far
}

export type StreamEvent = SpeechEvent | SilenceEvent

// A test conversation: what was said when + how long the user stays silent at the end.
export interface Conversation {
  name: string;
  words: WordEvent[];
  trailingSilenceMs: number;
}

// ============================================================================
// /v1/systemone request/response types
// ============================================================================

// A single question the systemone endpoint evaluates.
export interface SystemOneQuestion {
  type: 'choice' | 'score' | 'noul';
  instructions: string;
  criteria?: Record<string, string> | string[];
}

// Per-question answer from /v1/systemone.
export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
}

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

export type SystemOneAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer

// /v1/systemone response: one answer per question.
export interface SystemOneResponse {
  model: string;
  answers: Record<string, SystemOneAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

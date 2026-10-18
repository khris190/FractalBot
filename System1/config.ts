// Server endpoints for the /v1/systemone decision API — four models to compare.
export const SERVER_URL_A = 'http://localhost:12345/v1/systemone'
export const SERVER_URL_B = 'http://localhost:12346/v1/systemone'

// System prompt is now defined in runner.ts (PROMPTS array).
// This constant is kept for backward compatibility.
export const SYSTEM_PROMPT = ''

// How many recent events the decision model sees (including the latest).
export const HISTORY_WINDOW = 1000

// Score at or above this means the bigger AI takes the turn.
export const HANDOFF_THRESHOLD = 0.5

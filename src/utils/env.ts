import 'dotenv/config'
import path from 'node:path'

const TOKEN = process.env.TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const GUILD_ID = process.env.GUILD_ID
const DATA_PATH = process.env.DATA_PATH ?? './data'
const LOG_PATH = process.env.LOG_PATH ?? './logs'
const DB_FILE = process.env.DB_FILE ?? 'db.sqlite'
// Port matches python/server.py (5000); docker-compose overrides this internally.
const SIMILARITY_ENDPOINT = process.env.SIMILARITY_ENDPOINT ?? 'localhost:5000'
// Local servers (llama.cpp/LM Studio) are plain HTTP; accept scheme-less host:port
const RAW_LLM_ENDPOINT = process.env.LLM_ENDPOINT ?? 'localhost:8080'
const LLM_ENDPOINT = /^https?:\/\//.test(RAW_LLM_ENDPOINT) ? RAW_LLM_ENDPOINT : `http://${RAW_LLM_ENDPOINT}`
// 'llama' = llama.cpp /completion; 'openai' = OpenAI-compatible (LM Studio) /v1/completions
const LLM_MODE = (process.env.LLM_MODE ?? 'llama').toLowerCase()
// model identifier sent in openai mode (LM Studio ignores it, but the API requires a field)
const LLM_MODEL = process.env.LLM_MODEL ?? 'local-model'
// Optional: reasoning budget for thinking models (OpenAI field `reasoning_effort`: minimal|low|medium|high).
// Unset = field omitted, so servers that don't know it never see it.
const LLM_REASONING_EFFORT = process.env.LLM_REASONING_EFFORT?.toLowerCase()
// Abort a hung LLM request; without it one stuck call stalls the entire single-flight queue
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 60_000)
// Old misspelled name kept as fallback for existing .env files
const SIMILARITY_THRESHOLD = Number(process.env.SIMILARITY_THRESHOLD ?? process.env.SIMILARITY_TRESHOLD) || 0.9
// Overridable so tests can point at a temp dir; production uses the docker mount
const LLM_DATA_PATH = process.env.LLM_DATA_PATH ?? '/app/data/LLM'
const DB_PATH = path.resolve(DATA_PATH, DB_FILE)
export default {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  DB_PATH,
  DATA_PATH,
  LLM_DATA_PATH,
  LOG_PATH,
  SIMILARITY_ENDPOINT,
  SIMILARITY_THRESHOLD,
  LLM_ENDPOINT,
  LLM_MODE,
  LLM_MODEL,
  LLM_REASONING_EFFORT,
  LLM_TIMEOUT_MS,
}

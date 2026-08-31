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
const LLM_ENDPOINT = process.env.LLM_ENDPOINT ?? 'localhost:8080'
// Old misspelled name kept as fallback for existing .env files
const SIMILARITY_THRESHOLD = Number(process.env.SIMILARITY_THRESHOLD ?? process.env.SIMILARITY_TRESHOLD) || 0.9
const DB_PATH = path.resolve(DATA_PATH, DB_FILE)
export default {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  DB_PATH,
  DATA_PATH,
  LOG_PATH,
  SIMILARITY_ENDPOINT,
  SIMILARITY_THRESHOLD,
  LLM_ENDPOINT,
}

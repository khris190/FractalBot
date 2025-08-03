import 'dotenv/config'
import path from 'node:path'

const TOKEN = process.env.TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const GUILD_ID = process.env.GUILD_ID
const DATA_PATH = process.env.DATA_PATH ?? './data'
const LOG_PATH = process.env.LOG_PATH ?? './logs'
const DB_FILE = process.env.DB_FILE ?? 'db.sqlite'
const SIMILARITY_ENDPOINT = process.env.SIMILARITY_ENDPOINT ?? 'localhost:8000'
const SIMILARITY_TRESHOLD = Number(process.env.SIMILARITY_TRESHOLD) ?? 0.9
const DB_PATH = path.resolve(DATA_PATH, DB_FILE)
export default {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  DB_PATH,
  DATA_PATH,
  LOG_PATH,
  SIMILARITY_ENDPOINT,
  SIMILARITY_TRESHOLD
}

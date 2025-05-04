import 'dotenv/config'
import path from 'node:path'

const TOKEN = process.env.TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const GUILD_ID = process.env.GUILD_ID
const DATA_PATH = '/app/data'
const DB_FILE = process.env.DB_FILE ?? 'db.sqlite'
const DB_PATH = path.resolve(DATA_PATH, DB_FILE)
export default {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  DB_PATH,
  DATA_PATH
}

import env from '../env'
import 'dotenv/config'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const sqlite = new Database(env.DB_FILE)
const db = drizzle({ client: sqlite })
export default db

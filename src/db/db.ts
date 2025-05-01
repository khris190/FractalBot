import env from '../env'
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/libsql'

const db = drizzle(env.DB_FILE)
export default db

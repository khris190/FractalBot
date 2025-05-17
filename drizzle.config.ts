import { defineConfig } from 'drizzle-kit'
import env from './src/utils/env'
export default defineConfig({
  out: './src/utils/db/migrations',
  schema: './src/utils/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: env.DB_PATH,
  },
})

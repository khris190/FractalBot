import 'dotenv/config'

export default {
  TOKEN: process.env.TOKEN,
  DB_FILE: process.env.DB_FILE ?? 'db.sqlite',

}

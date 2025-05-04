import { sql } from 'drizzle-orm'
import { text, int, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const imageChannel = sqliteTable('imageChannel', {
  id: int().primaryKey({ autoIncrement: true }),
  channelId: text().notNull(),
  name: text(),
  updatedAt: text('updatedAt')
    .notNull()
    .$onUpdate(() => sql`(current_timestamp)`),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(current_timestamp)`),
}, (table) => [
  uniqueIndex('imageChannelIdx').on(table.channelId)
])

export const messageBlacklistChannel = sqliteTable('messageBlacklistChannel', {
  id: int().primaryKey({ autoIncrement: true }),
  channelId: text().notNull(),
  name: text(),
  updatedAt: text('updatedAt')
    .notNull()
    .$onUpdate(() => sql`(current_timestamp)`),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(current_timestamp)`),
}, (table) => [
  uniqueIndex('messageBlacklistChannelIdx').on(table.channelId)
])

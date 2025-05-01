import { sql } from 'drizzle-orm'
import { text, int, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const imageChannels = sqliteTable('imageChannels', {
  id: int().primaryKey({ autoIncrement: true }),
  channelId: int().notNull(),
  updatedAt: text('updatedAt')
    .notNull()
    .$onUpdate(() => sql`(current_timestamp)`),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(current_timestamp)`),
}, (table) => [
  uniqueIndex('channelIdx').on(table.channelId)
])

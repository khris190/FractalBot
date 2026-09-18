import { sql } from 'drizzle-orm'
import { text, int, sqliteTable, uniqueIndex, integer } from 'drizzle-orm/sqlite-core'

export const ImageChannel = sqliteTable('imageChannel', {
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

// Currently unused by any code — kept for a planned channel-blacklist feature.
// Safe to remove (along with its migrations) if that never materializes.
export const MessageBlacklistChannel = sqliteTable('messageBlacklistChannel', {
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
export const ConversationTurn = sqliteTable('conversationTurn', {
  id: int().primaryKey({ autoIncrement: true }),
  threadId: text().notNull(), // conversation key (root message id of the reply-chain)
  messageId: text().unique(), // discord message id this turn corresponds to
  role: text().notNull(), // 'user' | 'assistant'
  content: text().notNull(),
  upvotes: int().notNull().default(0), // 👍 count (bot's own seed reaction excluded)
  downvotes: int().notNull().default(0), // 👎 count
  promoted: int('promoted').notNull().default(0), // 1 = kept as a "best message" after /remember
  createdAt: text('createdAt')
    .notNull()
    .$onUpdate(() => sql`(current_timestamp)`)
    .default(sql`(current_timestamp)`),
})

export const GuildData = sqliteTable('guildData', {
  id: text().primaryKey(),
  lastWishTimeStamp: int(),
  moviesChannel: text(),
  updatedAt: text('updatedAt')
    .notNull()
    .$onUpdate(() => sql`(current_timestamp)`),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(current_timestamp)`),
})

export const Movies = sqliteTable('movies', {
  id: text().primaryKey(),
  title: text().notNull(),
  watched: integer({ mode: 'boolean' }),
  updatedAt: text('updatedAt')
    .notNull()
    .$onUpdate(() => sql`(current_timestamp)`),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`(current_timestamp)`),

})

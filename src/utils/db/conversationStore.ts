import db from './db'
import { ConversationTurn } from './schema'
import { eq, and, asc, inArray, ne } from 'drizzle-orm'

export interface Turn {
  messageId: string | null
  role: string
  content: string
  upvotes: number
  downvotes: number
  promoted: boolean
  // 'YYYY-MM-DD HH:MM:SS' UTC (sqlite current_timestamp) — e.g. dates the daily memory file
  createdAt: string
}

const store = {
  addTurn (threadId: string, messageId: string | null, role: string, content: string) {
    if (messageId) {
      const existing = db.select().from(ConversationTurn).where(eq(ConversationTurn.messageId, messageId)).get()
      if (existing) return // already stored
    }
    db.insert(ConversationTurn).values({ threadId, messageId, role, content }).run()
  },

  // Apply a single 👍/👎 reaction change to the turn that owns `messageId`.
  // Counts are net (add vs remove) and clamped at zero so a removed vote can't go negative.
  recordVote (messageId: string, isUpvote: boolean, added: boolean): boolean {
    const row = db.select().from(ConversationTurn).where(eq(ConversationTurn.messageId, messageId)).get()
    if (!row) return false // not one of our stored turns (e.g. a user message we never tracked)
    const delta = added ? 1 : -1
    if (isUpvote) {
      db.update(ConversationTurn).set({ upvotes: Math.max(0, row.upvotes + delta) }).where(eq(ConversationTurn.messageId, messageId)).run()
    } else {
      db.update(ConversationTurn).set({ downvotes: Math.max(0, row.downvotes + delta) }).where(eq(ConversationTurn.messageId, messageId)).run()
    }
    return true
  },

  // Replace the trailing ' [image]' marker with ' [image: caption]' (caption-at-ingest) so
  // future prompts remember what the image showed. No-op when the row is gone or already captioned.
  setTurnImageCaption (messageId: string, caption: string): boolean {
    const row = db.select().from(ConversationTurn).where(eq(ConversationTurn.messageId, messageId)).get()
    if (!row || !row.content.endsWith(' [image]')) return false
    db.update(ConversationTurn).set({ content: row.content.slice(0, -' [image]'.length) + ` [image: ${caption}]` }).where(eq(ConversationTurn.messageId, messageId)).run()
    return true
  },

  // Live-context view: promoted rows are a permanent archive (kept out of chat prompts
  // so they can't bloat or pollute the context); use getAllThreads to see everything.
  getThread (threadId: string): Turn[] {
    const rows = db.select().from(ConversationTurn)
      .where(and(eq(ConversationTurn.threadId, threadId), eq(ConversationTurn.promoted, 0)))
      .orderBy(asc(ConversationTurn.id)).all()
    return rows.map(r => ({ messageId: r.messageId ?? null, role: r.role, content: r.content, upvotes: r.upvotes, downvotes: r.downvotes, promoted: !!r.promoted, createdAt: r.createdAt }))
  },

  getAllThreads (): Map<string, Turn[]> {
    const rows = db.select().from(ConversationTurn).orderBy(asc(ConversationTurn.threadId), asc(ConversationTurn.id)).all()
    const map = new Map<string, Turn[]>()
    for (const row of rows) {
      if (!map.has(row.threadId)) map.set(row.threadId, [])
      map.get(row.threadId)!.push({ messageId: row.messageId ?? null, role: row.role, content: row.content, upvotes: row.upvotes, downvotes: row.downvotes, promoted: !!row.promoted, createdAt: row.createdAt })
    }
    return map
  },

  // Raw day log: every row in arrival order (id = insertion order), optionally minus one thread.
  // Feeds the "Today so far" prompt section — the unconsolidated part of the day.
  getToday (excludeThreadId?: string): Turn[] {
    const query = db.select().from(ConversationTurn).orderBy(asc(ConversationTurn.id))
    const rows = excludeThreadId
      ? query.where(ne(ConversationTurn.threadId, excludeThreadId)).all()
      : query.all()
    return rows.map(r => ({ messageId: r.messageId ?? null, role: r.role, content: r.content, upvotes: r.upvotes, downvotes: r.downvotes, promoted: !!r.promoted, createdAt: r.createdAt }))
  },

  clearThread (threadId: string): number {
    const result = db.delete(ConversationTurn).where(eq(ConversationTurn.threadId, threadId)).run()
    return result.changes ?? 0
  },

  // Flag the given turns as promoted (kept as a permanent "best messages" archive).
  markPromoted (messageIds: string[]): void {
    if (messageIds.length === 0) return
    db.update(ConversationTurn).set({ promoted: 1 }).where(inArray(ConversationTurn.messageId, messageIds)).run()
  },

  // Wipe everything EXCEPT promoted "best message" rows — those are kept as a permanent archive.
  clearUnpromoted (): number {
    const result = db.delete(ConversationTurn).where(eq(ConversationTurn.promoted, 0)).run()
    return result.changes ?? 0
  },

  clearAll (): number {
    const result = db.delete(ConversationTurn).run()
    return result.changes ?? 0
  }
}

export default store

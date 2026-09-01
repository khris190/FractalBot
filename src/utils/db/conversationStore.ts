import db from './db'
import { ConversationTurn } from './schema'
import { eq, asc } from 'drizzle-orm'

export interface Turn {
  messageId: string | null
  role: string
  content: string
}

const store = {
  addTurn (threadId: string, messageId: string | null, role: string, content: string) {
    if (messageId) {
      const existing = db.select().from(ConversationTurn).where(eq(ConversationTurn.messageId, messageId)).get()
      if (existing) return // already stored
    }
    db.insert(ConversationTurn).values({ threadId, messageId, role, content }).run()
  },


  getThread (threadId: string): Turn[] {
    const rows = db.select().from(ConversationTurn).where(eq(ConversationTurn.threadId, threadId)).orderBy(asc(ConversationTurn.id)).all()
    return rows.map(r => ({ messageId: r.messageId ?? null, role: r.role, content: r.content }))
  },

  getAllThreads (): Map<string, Turn[]> {
    const rows = db.select().from(ConversationTurn).orderBy(asc(ConversationTurn.threadId), asc(ConversationTurn.id)).all()
    const map = new Map<string, Turn[]>()
    for (const row of rows) {
      if (!map.has(row.threadId)) map.set(row.threadId, [])
      map.get(row.threadId)!.push({ messageId: row.messageId ?? null, role: row.role, content: row.content })
    }
    return map
  },

  clearThread (threadId: string): number {
    const result = db.delete(ConversationTurn).where(eq(ConversationTurn.threadId, threadId)).run()
    return result.changes ?? 0
  },

  clearAll (): number {
    const result = db.delete(ConversationTurn).run()
    return result.changes ?? 0
  }
}

export default store

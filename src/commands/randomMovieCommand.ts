import { BaseGuildTextChannel, ChatInputCommandInteraction, Message, Snowflake } from 'discord.js'
import BaseChatCommand from './base/BaseChatCommand'
import { hiddenInteractionReply } from '../utils/helpers'
import { GuildData, Movies } from '../utils/db/schema'
import db from '../utils/db/db'
import { desc, eq, sql } from 'drizzle-orm'

class RandomMovieCommand extends BaseChatCommand {
  constructor () {
    super('select_movie', 'Selects a random movie from chat without checkmark')
  }

  async getXmovies (interaction: ChatInputCommandInteraction, limit: number, before:Snowflake | undefined):Promise<Message<true>[]> {
    const messages = (await (interaction.channel as BaseGuildTextChannel).messages.fetch({ limit, before })).map(e => {
      return e
    }).sort((a, b) => {
      return a.createdTimestamp < b.createdTimestamp
        ? 1
        : a.createdTimestamp > b.createdTimestamp ? -1 : 0
    })
    return messages
  }

  async getMoviesUntill (interaction: ChatInputCommandInteraction, untill: Snowflake | undefined = undefined): Promise<Message<true>[]> {
    const movies = []
    let last = []
    let before: Snowflake | undefined
    const limit = 5
    do {
      last = await this.getXmovies(interaction, limit, before)
      movies.push(...last)
      before = movies[movies.length - 1]?.id
      console.log(last.map(a => { return a.content }))
    } while (last.length === limit && !last.some(a => { return a.id === untill }))
    return movies
  }

  async run (interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = db.select().from(GuildData).where(eq(GuildData.id, interaction.guildId || '')).get()
    if (!guild) {
      hiddenInteractionReply(interaction, "Apparently this server doesn't exist, not my problem")
      return
    }
    console.log(guild, guild.moviesChannel, !guild.moviesChannel)
    if (!guild.moviesChannel) {
      guild.moviesChannel = interaction.channel?.id || ''
      await db.update(GuildData).set(guild).where(eq(GuildData.id, guild.id))
    }

    console.log(interaction.channel?.id, guild.moviesChannel, interaction.channel?.id !== guild.moviesChannel)
    if (interaction.channel?.id !== guild.moviesChannel) {
      hiddenInteractionReply(interaction, 'Tomek kurwo urwiesz mi od internetu')
      return
    }

    const movLast = db.select().from(Movies).orderBy(desc(Movies.id)).get()
    const movies = await this.getMoviesUntill(interaction, movLast?.id)
    movies.forEach(m => {
      const watched = !!m.reactions.cache.get('✅')
      console.log({ id: m.id, title: m.content, watched })
      db.insert(Movies)
        .values({ id: m.id, title: m.content, watched })
        .onConflictDoUpdate({ target: Movies.id, set: { watched } })
        .then(res => console.log(res))
    })
    while (true) {
      const mov = db.select().from(Movies).where(eq(Movies.watched, false)).orderBy(sql`RANDOM()`).get()
      console.log(mov)
      if (mov) {
      // get a random unwatched movie from db
        const m = await interaction.channel?.messages.fetch(mov.id)
        if (m) {
        // check if its watched
          const watched = !!m.reactions.cache.get('✅')
          // if yes update movie in db and retry
          if (watched) {
            db.insert(Movies)
              .values({ id: m.id, title: m.content, watched })
              .onConflictDoUpdate({ target: Movies.id, set: { watched } })
              .then(res => console.log(res))
            continue
          }
          hiddenInteractionReply(interaction, mov.title)
          return
        } else {
          hiddenInteractionReply(interaction, 'Discord shat it\'s pants, not my fault')
          break
        }
      }
    }
    hiddenInteractionReply(interaction, 'Unable to find good enough movie')
  }
}

module.exports = new RandomMovieCommand()

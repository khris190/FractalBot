import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'

export class Defer<T> extends Promise<T> {
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: any) => void

  constructor () {
    let res!:(value: T | PromiseLike<T>) => void
    let rej!:(reason?: any) => void

    super((resolve, reject) => {
      res = resolve
      rej = reject
    })

    this.resolve = res
    this.reject = rej
  }

  static get [Symbol.species] () {
    return Promise
  }

  get [Symbol.toStringTag] () {
    return 'Defer'
  }
}

export function sleep (ms:number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function hiddenInteractionReply (interaction: ChatInputCommandInteraction, message: string) {
  await interaction.reply({
    content: message,
    flags: MessageFlags.Ephemeral
  })
}

import { ChatInputCommandInteraction, MessageFlags } from 'discord.js'

export function getRandomFromArr (arr: any[]) :{ choice: any, index: number[] } {
  const i = Math.floor(Math.random() * arr.length)
  return { choice: arr[i], index: [i] }
}
export function getRandomFromArrRecursive (arr: any[], depth = 0) : { choice: any, index: number[] } {
  if (depth > 10) {
    throw new Error('Recursive depth error')
  }
  if (Array.isArray(arr)) {
    const i = Math.floor(Math.random() * arr.length)
    const res = getRandomFromArrRecursive(arr[i], depth++)
    return { choice: res.choice, index: [i, ...res.index] }
  } else { return { choice: arr, index: [-1] } }
}

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

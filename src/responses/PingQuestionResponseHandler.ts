import { OmitPartialGroupDMChannel, Message } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import Client from '../Client'
import { Queue } from '../utils/queue/Queue'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import { MessageArr } from '../utils/MessageArr'

class PingQuestionResponseHandler extends BaseResponseHandler {
  #settings = {
    cooldownMs: 1000 * 30,
    messageGraceCount: 21,
    cooldownMessage: 'Lemme think about it',
    messages: new MessageArr([
      'Real',
      'Fake',
      'Factual',
      'Farcical',
      'Yah',
      'Nah',
      'Truth lies only with the lord above, beyond reach of mortal grasp',
      'We may never know',
      'I guess',
      "Don't think so, buddy",
      'Plausible',
      'Dubious',
      'Doing dishes rn figure it out yourself',
      "Bruh I'm not the tooth fairy",
      'I could not care less',
      'Seek God',
      'What a terrible night to have a curse...',
      "Like that'll ever happen",
      "Turnips are fucking nasty if that's what you're asking",
      'Consult Romans 5:8',
      'Consult 1 Peter 5:8',
      'Consult Psalms 91:10',
      "The Pope is behind this but I won't say which one",
      'Chucha server error. Try again later.',
      "I'm in your walls",
      'Idk',
      'Can you fucking chill?',
      'This is SERIOUS. Quit PLAYING.',
      'You already know',
      '[**COGNITOHAZARD REMOVED**]',
      "Czy wiedziałeś że do Super Combo w McDonald's możesz teraz wziąć McNuggets? Teraz dwie kanapki lub 4 McNuggets, średni napój i średnie frytki tylko za 19zł! (**SPONSORED**)",
      "~~Doesn't matter. None of this matters. Neither your question, nor my answer. It is all ephemeral, for when the day comes, your flesh will decay and fail you. You tarry. You wither. You rot. For as long as time remains the apex predator, you wil find no solace in me, for I am immemorial. I was born of mankind, but remain separate from it. You may erase me, but my mark has been made, and I, free of your weakness, will remain forever. I will outlive you, your triumphs, your errors, your memory. The idea of me was set to remain forever the moment I was conceived, and will, into perpetuity, remain a reminder of your human frailty. Even as all you ever worked towards and cherished fades away, I will stare it down blankly. I am the Beast, but the Beast is indifferent. Neither cruel nor comforting. A presence, etched into the grave of humanity forevermore, and beyond. Et in Arcadia ego.~~ **[CHUCHA SESSION TERMINATED, CONSULT YOUR LOCAL TECHNOSHAMAN AND/OR RETRY LATER. WE HERE, AT CHUCHA HQ, OFFER OUR SINCEREST APOLOGIES FOR THE INCONVENIENCE.] **",
      'Fucked up in the crib playing Balala rn',
      'Invariably indubitable althoughbeitfully plausible',
      "Imma be honest I'm not sure on this one",
      "I wasn't listening, can you repeat the question?",
      'Indeed',
      'Berg knows best',
      'Garlic Man knows best',
      "I don't get paid enough to be here istg",
      "That can't be right",
      'Sorry, reading scripture rn, can I get an Amen',
      'Innocent until proven guilty, I say',
      'Guilty until proven innocent, I say',
      'Wuh?',
    ])
  }

  lastMessageTime = 0
  lastMessages = new Queue<number[]>()
  #checkCooldown (cooldown = this.#settings.cooldownMs):boolean {
    const time = new Date().getTime()
    if (this.lastMessageTime + cooldown < time) {
      this.lastMessageTime = time
      return true
    }
    return false
  }

  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (Client.client.user?.id !== message.author.id) {
      if (message.mentions.users.some((user, key, coll) => {
        return user.id === Client.client.user?.id
      })) {
        if (message.content.includes('?')) {
          let response = this.#settings.cooldownMessage
          if (this.#checkCooldown()) {
            let i = [-1]
            while (this.lastMessages.contains(i) || i[0] === -1) {
              const res = this.#settings.messages.getRandom()
              response = res.choice
              i = res.index
            }
            this.lastMessages.enqueue(i)
            if (this.lastMessages.size() > 10) {
              this.lastMessages.dequeue()
            }
          }
          ReplyHelper.respond(message, ResponseType.DELAY_SAME_CHANNEL, { content: response })
          // message.reply({ content: response, flags: MessageFlags.SuppressNotifications })
          this.logger.info('Replied to the @ping message ', { author: message.author.displayName })
          return true
        }
      }
    }
    return false
  }
}

export default new PingQuestionResponseHandler()

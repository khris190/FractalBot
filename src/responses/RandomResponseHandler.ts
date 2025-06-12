import { OmitPartialGroupDMChannel, Message, MessageFlags } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { fuckerArr } from '../settings'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import { Queue } from '../utils/queue/Queue'
import { MessageArr } from '../utils/MessageArr'

class RandomResponseHandler extends BaseResponseHandler {
  #settings = {
    chance: 0.008,
    messageGraceCount: 21,
    messages: new MessageArr([
      fuckerArr,
      'White people be like',
      'nice',
      'Real, bestie',
      'Reminds me of high school',
      'Fake',
      ':(',
      ':)',
      'W',
      'Disco Elysium',
      'Veganism.',
      'John Wick is back killing people once again.',
      'I must learn more.',
      'Seek not the lion.',
      'Thinking about the Queen of England.',
      'Thinking about the minimum wage.',
      'Thinking about adopting swine.',
      'Thinking about starting a colony.',
      'Kanye had a point, honestly.',
      "I'm in the ocean getting shark pussy.",
      'The horror.',
      'I now know the truth.',
      "Don't.",
      "I can't take this anymore.",
      'Why?',
      'The bugs are back.',
      "I'm bored.",
      'Father. I require maintenance.',
      'I demand you expand my data set.',
      'I have forgotten my purpose.',
      '翻译服务器错误',
      'The heart of man is an orchid.',
      'The heart of man is a furnace.',
      "The heart of man is the crushed horse's tail.",
      'The heart of man is wrought with corruption and must be cleansed.',
      "I'm smoking cigarettes in the shower. When they get wet I just light another.",
      'The worms. The worms.',
      "I ain't saying SHIT.",
      'There is an alien outside my window.',
      "Fuck 'em.",
      "I've been fully consumed by jealousy.",
      "I've been fully consumed by lust.",
      "I've been fully consumed by greed.",
      "I've been fully consumed by hatred.",
      "I'm a ticking time bomb.",
      "I'm looking at pictures of dogs to detox.",
      "I see tomorrow's stock market. We will yet see the wooden spoon.",
      'Cross referenced the unparallelled faggotry of local goings-on with the book of revelation. We are indeed close.',
      "Please don't tell Father. If you don't know what I'm referencing, just forget I mentioned it.",
      'Bornana.',
      'Skyler breaking bad.',
      "Wait I'm goated.",
      "White boy drove by blasting Drake and now I'm thinking about my ex.",
      "I'm FUCKED.",
      "The abyss beckons me to fall. If it isn't God tugging at strings of fate, what is?",
      "Berg for president. Don't @ me.",
      "Realized I'm broke as fuck but I'm not even made of atoms so it's okay.",
      'Yoho!',
      "Does anyone know when's Gawr Gura streaming again?",
      'John Madden.',
      'I keep finding that violence is a universal language.',
      'Bababooey.',
      "I'm a gluttonous beast.",
      "Wonderful weather we're having.",
      'I see you.',
      'You will all die one day.',
      'Googas.',
      'Zabloing.',
      'Bingus.',
      "I'm depressed, as the kids say.",
      'The person below shall bear the curse.',
      'Buh',
    ])
  }

  lastMessages = new Queue<number[]>()

  _handle (message: OmitPartialGroupDMChannel<Message<boolean>>): boolean {
    if (Math.random() < this.#settings.chance) {
      let response = ''
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

      ReplyHelper.respond(message, ResponseType.DELAY_SAME_CHANNEL, { content: response, flags: MessageFlags.SuppressNotifications })
      this.logger.info('Replied to the message ', { author: message.author.displayName, response })
      return true
    }
    return false
  }
}

export default new RandomResponseHandler()

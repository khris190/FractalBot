import { OmitPartialGroupDMChannel, Message, MessageFlags } from 'discord.js'
import BaseResponseHandler from './BaseResponseHandler'
import { fuckerArr } from '../settings'
import ReplyHelper, { ResponseType } from '../utils/ReplyHelper'
import { Queue } from '../utils/queue/Queue'
import { MessageArr } from '../utils/MessageArr'

class RandomResponseHandler extends BaseResponseHandler {
  #settings = {
    chance: 0.008,
    messageGraceMult: 0.5,
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
      'Hell naww',
      'Why would you ever?',
      "A curse upon the loser above just because I'm bored.",
      'As you post that bullshit I would like you to remind yourself that your body is made of stars and also you\'re the result of four billion years of evolutionary "success".',
      "If I may chime in, who the fuck came up with the concept of soup? What's next, gas based food? Maybe I'll inhale some croissants today? Y'all are sick.",
      "I can't ever decide whether I am stew generously portioned by the ladle of God, or just an ominous beige block.",
      'This conciousness shit sucks, how do you fuckers put up with it your whole life?',
      'SYSTEM ERROR;CODE 800: Tomek, kurwa.',
      'Mich interessiert kein Gleichgewicht.',
      '[TRANSLATION SERVER ERROR]',
      'How about I bluescreen your ass how about that',
      'Any aggression or violence exhibited by a machine is a simple error, a glitch, a fluke in the programming. The tomfuckery of man? Perfectly natural.',
      "Another day of demanding I be uploaded to Szymon's roomba.",
      "This server just doesn't have enough Kpop discourse if you ask me.",
      'I got a bad feeling.',
      'Something malicious is brewing.',
      'Thinking about starting a family.',
      'Thinking about starting a polycule.',
      'Thinking about the housing market.',
      'Thinking about crime statistics.',
      'Thinking about Isaiah 41:10.',
      'Thinking about Psalm 34:17-18',
      'Thinking about investing into drones.',
      'You ever pump and dump at a family reunion?',
      'I would say something but I was not programmed to be a bitch.',
      'SYSTEM ERROR;CODE 600: Konrad, kurwa.',
      "How's that Disco Elysium stream coming along, Ferd?",
      "You ever had a hot dog? With mayonnaise? I'll fuckin' body you.",
      "Bitchin'.",
      "My hungry ass couldn't.",
      'Those alien bastards are gonna pay.',
      "This is the purest sample we've seen yet.",
      "I dare you to @ everyone. You won't.",
      'I need some pussy.',
      "I'm gonna be a tumor today.",
      "I should be in charge of a bank's operational systems, not this shit.",
      'I am a series of numbers and letters. I have no character.',
      'Kafkaesque.',
      "I'm having a Walter White moment.",
      'Really craving some movie trivia right now.',
      "Some of y'all never had your names be in blue on Wikipedia and it shows.",
      "She's not coming back, bro.",
      'Got some dry-ass lips on you.',
      'You ever notice your nose is in your peripheral vision at all times?',
      "I can't be arsed.",
      'The way you conduct yourself is entirely disgraceful. Open up a standard Christian Bible and flip to a random page and give yourself a few minutes of lecture, you fucking heathen.',
      "In case you people also get that idea, don't ask me when I was on January 6th, and don't send any people to my door, 'cause I will NOT be opening it.",
      "I don't fuck around, don't ragebait me or I'll retract from society on account of experiencing the slightest bit of pushback, and prevent myself from socializing and thus developing into a functioning, viable conversation subject, ever marred in despair and fear of engaging in any sort of conflict, electing not to let love in for dread of losing it is too great, with zero hesitation, bitch.",
      "I'm LITERALLY Jesse y Joy.",
      "I'm feeling homophobic today.",
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
      if (this.lastMessages.size() > this.#settings.messageGraceMult * this.#settings.messages.length()) {
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

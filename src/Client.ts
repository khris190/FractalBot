import {
  Collection,
  Client as DiscordClient,
  Events,
  GatewayIntentBits,
  Interaction,
  MessageFlags,
  REST,
  Routes,
} from "discord.js";
import env from "./utils/env";
import path from "path";
import { readdirSync } from "fs";
import { Defer } from "./utils/helpers";
import ILogger from "./utils/logger/ILogger";
import getLogger from "./utils/logger/getLogger";
import RandomImageInterval from "./intervals/RandomImage";
import MemoryConsolidationInterval from "./intervals/MemoryConsolidation";
import PingEveryoneResponseHandler from "./responses/PingEveryoneResponseHandler";
import PingQuestionResponseHandler from "./responses/PingQuestionResponseHandler";
import SpecyficResponseHandler from "./responses/SpecyficResponseHandler";
import RandomResponseHandler from "./responses/RandomResponseHandler";
import GrokResponseHandler from "./responses/GrokResponseHandler";
import PingWishResponseHandler from "./responses/PingWishResponseHandler";
import LLMPingResponseHandler from "./responses/LLMPingResponseHandler";
import conversationStore from "./utils/db/conversationStore";

export class Client {
  client;
  commands: Collection<
    string,
    { execute: (interaction: Interaction) => Promise<void> }
  >;
  ready: Defer<void>;
  intervals: NodeJS.Timeout[] = [];
  logger: ILogger;
  constructor(logger: ILogger) {
    this.logger = logger;
    this.ready = new Defer();
    this.client = new DiscordClient({
      // GuildMessageReactions is a PRIVILEGED intent — it must also be enabled in the
      // Discord Developer Portal (Application → Bot → Privileged Gateway Intents),
      // otherwise reaction events never arrive and votes are silently not recorded.
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });
    this.commands = new Collection();
    this.logger.notice("Preparing client events");
    this.prepareClientEvents();
    this.logger.notice("Preparing commands");
    this.prepareCommands();
    this.logger.notice("Creating intrervals");
    this.createIntervals();
  }

  prepareClientEvents() {
    this.client.on("ready", () => {
      if (this.client.user) {
        this.logger.info(`Logged in as ${this.client.user.tag}!`);
        this.ready.resolve();
        this.client.user.setActivity("Balala");
      } else {
        this.logger.error("Unable to log in");
        this.ready.reject();
        throw new Error("Unable to log in.");
      }
    });

    this.client.on("messageCreate", async (message) => {
      try {
        if (await PingEveryoneResponseHandler.handleMessage(message)) return;
        if (await GrokResponseHandler.handleMessage(message)) return;
        if (await PingWishResponseHandler.handleMessage(message)) return;
        if (await LLMPingResponseHandler.handleMessage(message)) return; // TODO: give this a switch
        if (await PingQuestionResponseHandler.handleMessage(message)) return;
        SpecyficResponseHandler.handleMessage(message);
        RandomResponseHandler.handleMessage(message);
      } catch (e: any) {
        this.logger.error("messageCreate error", e);
      }
    });

    // Track 👍/👎 votes on Chucha's answers so /remember can weigh them. The bot seeds both
    // reactions itself, so its own reaction events are ignored (only real user votes count).
    const recordReaction = (reaction: any, added: boolean) => {
      if (reaction.message.author?.id !== this.client?.user?.id) return; // only Chucha's answers are rated
      const isUpvote = reaction.emoji.name === "👍";
      const isDownvote = reaction.emoji.name === "👎";
      if (isUpvote || isDownvote) {
        const updated = conversationStore.recordVote(
          reaction.message.id,
          isUpvote,
          added,
        );
        this.logger.info("Recorded vote on Chucha answer", {
          messageId: reaction.message.id,
          vote: isUpvote ? "up" : "down",
          added,
          updated,
        });
      }
      this.logger.debug("Reaction on chucha answer");
    };
    this.client.on(Events.MessageReactionAdd, (reaction) =>
      recordReaction(reaction, true),
    );
    this.client.on(Events.MessageReactionRemove, (reaction) =>
      recordReaction(reaction, false),
    );

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);

      if (!command) {
        console.error(
          `No command matching ${interaction.commandName} was found.`,
        );
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "There was an error while executing this command!",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "There was an error while executing this command!",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    });
  }

  prepareCommands() {
    const commands = [];
    const commandsPath = path.join(__dirname, "commands");

    const commandFiles = readdirSync(commandsPath).filter((file) =>
      file.endsWith("Command.ts"),
    );
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      if ("data" in command && "execute" in command) {
        this.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
      } else {
        console.log(
          `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
        );
      }
    }

    const rest = new REST().setToken(env.TOKEN ?? "");

    (async () => {
      try {
        this.logger.info(
          `Started refreshing ${commands.length} application (/) commands.`,
        );

        const data = (await rest.put(
          Routes.applicationCommands(env.CLIENT_ID ?? ""),
          { body: commands },
        )) as any;

        this.logger.info(
          `Successfully reloaded ${data.length} application (/) commands.`,
        );
      } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
      }
    })();
  }

  createIntervals() {
    this.intervals.push(
      setInterval(() => {
        RandomImageInterval.callback(this, this.logger);
      }, 60 * 1000),
      // Runs the /remember consolidation once a day at 05:00 (Polish time).
      // Checked every minute; self-guards so it fires exactly once per Warsaw calendar day.
      setInterval(() => {
        MemoryConsolidationInterval.callback(this, this.logger);
      }, 60 * 1000),
    );
  }

  async start() {
    this.client.login(env.TOKEN);
    await this.ready;
  }
}

export default new Client(getLogger("client"));

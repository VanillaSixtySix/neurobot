import {ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder, Snowflake} from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';

const perChannelCooldowns: { [id: Snowflake]: number } = {
    "1059569601144442911": 60,
    "1072697081443131476": 60
}

export default class Fun implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new SlashCommandBuilder()
            .setName('pet')
            .setDescription('Pets the bot.')
            .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
        new SlashCommandBuilder()
            .setName('cookie')
            .setDescription('Gives the bot a cookie!')
            .setContexts(InteractionContextType.Guild),
    ];

    async init() {
        this.client.db.exec(`
            CREATE TABLE IF NOT EXISTS cookies (
                user TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                channel TEXT NOT NULL
            )
        `);
    }

    async onChatInteraction(interaction: ChatInputCommandInteraction) {
        if (interaction.commandName === 'pet') {
            await this.onPet(interaction);
        }
        if (interaction.commandName === "cookie") {
            await this.onCookie(interaction);
        }
    }

    async onPet(interaction: ChatInputCommandInteraction) {
        await interaction.reply('aww, thank you~ ( ◡‿◡ *)');
    }

    async onCookie(interaction: ChatInputCommandInteraction) {
        let lastCookieGivenTimestampQuery = this.client.db.query("SELECT timestamp FROM cookies WHERE channel = ? ORDER BY timestamp DESC LIMIT 1;");
        let lastCookieGivenTimestamp = (lastCookieGivenTimestampQuery.get(interaction.channelId!) as any || {timestamp:0}).timestamp;

        let cooldown = perChannelCooldowns[interaction.channelId!] || 10;
        if ((lastCookieGivenTimestamp + (cooldown * 1000)) > Date.now()) {
            await interaction.reply({
                content: `I don't want cookies right now, try again in a bit!`,
                ephemeral: true
            });
            return;
        }

        let eatCookieQuery = this.client.db.query("INSERT INTO cookies (user, timestamp, channel) VALUES ($1, $2, $3)");
        eatCookieQuery.run(interaction.user.id, Date.now(), interaction.channelId!);

        let eatenCookiesFromUserQuery = this.client.db.query("SELECT COUNT(timestamp) FROM cookies WHERE user = ?")
        let eatenCookiesFromUser = (eatenCookiesFromUserQuery.get(interaction.user.id) as any)["COUNT(timestamp)"];

        let eatenCookiesGloballyQuery = this.client.db.query("SELECT COUNT(timestamp) FROM cookies")
        let eatenCookiesGlobally = (eatenCookiesGloballyQuery.get(interaction.user.id) as any)["COUNT(timestamp)"];

        await interaction.reply({
            content: "🍪 <:neurOMEGALUL:1097297318119743638> Om nom nom\n"+
                `You've given me **${eatenCookiesFromUser}** cookies! | I've received **${eatenCookiesGlobally}** cookies from everyone so far!`
        });
    }
}

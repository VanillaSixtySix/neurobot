import {
    ChatInputCommandInteraction,
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder
} from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';

const lastDiscordAPIPing = {
    timestamp: -1,
    ping: -1,
};

interface DayMetricResponse {
    summary: {
        mean: number;
    };
}

export default class Ping implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Gets the ping of the client and Discord\'s API')
            .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    ];

    async onChatInteraction(interaction: ChatInputCommandInteraction) {
        const ping = {
            client: this.client.ws.ping,
            discord: lastDiscordAPIPing.ping,
        };

        const now = new Date();
        if (now.getTime() - lastDiscordAPIPing.timestamp > 60000) {
            const discordAPIRes = await fetch('https://discordstatus.com/metrics-display/5k2rt9f7pmny/day.json');
            if (discordAPIRes.ok) {
                const json = await discordAPIRes.json() as DayMetricResponse;
                lastDiscordAPIPing.timestamp = now.getTime();
                lastDiscordAPIPing.ping = Math.round(json.summary.mean);
                ping.discord = lastDiscordAPIPing.ping;
            }
        }

        const clientPingText = ping.client === -1 ? 'N/A (retry in a minute)' : Math.round(ping.client).toString() + 'ms';
        const discordPingText = ping.discord === -1 ? 'N/A (failed)' : Math.round(ping.discord).toString() + 'ms';

        const response = `Client WebSocket ping: \`${clientPingText}\`\n` +
            `Discord API ping: \`${discordPingText}\``;

        await interaction.reply(response);
    }
}

import { Message, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';

interface GuildState {
    count: number;
    lastSticker: { name: string; id: string; } | null;
}

export default class Swarm implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Gets the ping of the client and Discord\'s API')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    ];

    guildStates: Map<string, GuildState> = new Map();

    async onMessageCreate(message: Message) {
        if (!message.guild) return;
        if (message.channelId !== config.interactions.swarm.targetChannel) return;
        if (message.stickers.size === 0) return;
        const sticker = message.stickers.first()!;

        const guildState = this.guildStates.get(message.guild.id) ?? { count: 0, lastSticker: null };
        if (guildState.lastSticker == null) {
            guildState.count = 1;
            guildState.lastSticker = { name: sticker.name, id: sticker.id };
        } else if (guildState.lastSticker.id === sticker.id) {
            guildState.count++;
            if (guildState.count % 5 === 0) {
                await message.channel.send(`${sticker.name} has a streak of ${guildState.count}!`);
            }
        } else {
            if (guildState.count >= 5) {
                await message.channel.send(`${message.author} broke ${guildState.lastSticker.name} streak of ${guildState.count}!`);
            }
            guildState.count = 1;
            guildState.lastSticker = {
                name: sticker.name,
                id: sticker.id,
            };
        }
        this.guildStates.set(message.guild.id, guildState);
    }
}

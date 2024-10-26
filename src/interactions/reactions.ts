import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    Events,
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder,
    TextChannel
} from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import { config, getServerConfig, RawPacket, parseEmojiString, parseMessageInput } from '../utils';

interface RawPacketReactionData {
    /** The ID of the user who owns/owned the reaction */
    user_id: string;
    message_id: string;
    guild_id: string;
    channel_id: string;
    emoji: {
        name: string;
        id: string;
        animated?: boolean;
    };
}

interface DBReaction {
    guild_id: string;
    channel_id: string;
    message_id: string;
    reactor_id: string;
    emoji: string;
    timestamp: number;
    added: 0 | 1;
}

interface ReactionBan {
    enabled: boolean;
    name: string;
    match: string;
    channels: string[];
    ignoredChannels: string[];
}

export default class Reactions implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new SlashCommandBuilder()
            .setName('reactions')
            .setDescription('Utilities for handling reactions')
            .setContexts(InteractionContextType.Guild)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
            .addSubcommand(subCommand =>
                subCommand
                    .setName('first')
                    .setDescription('Lists first reactions on a message')
                    .addStringOption(option =>
                        option
                            .setName('message')
                            .setDescription('Message ID or URL')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subCommand =>
                subCommand
                    .setName('listbans')
                    .setDescription('Lists all bans')
            ),
    ];

    async init() {
        const reactionBans = new Map<string, ReactionBan[]>();
        for (const serverConfig of config.servers) {
            reactionBans.set(serverConfig.guildId, serverConfig.interactions.reactions.bans);

            this.client.db.exec(`
                CREATE TABLE IF NOT EXISTS reactions (
                    guild_id TEXT NOT NULL,
                    channel_id TEXT NOT NULL,
                    message_id TEXT NOT NULL,
                    reactor_id TEXT NOT NULL,
                    emoji TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    added INTEGER NOT NULL DEFAULT 1
                )
            `);
        }

        this.client.on(Events.Raw, async (packet: RawPacket<RawPacketReactionData>) => {
            if (packet.t !== 'MESSAGE_REACTION_ADD' && packet.t !== 'MESSAGE_REACTION_REMOVE') return;
            if (typeof packet.d.guild_id === 'undefined') return;
            if (!reactionBans.has(packet.d.guild_id)) return;

            const formedName = packet.d.emoji.id != null ? `<${packet.d.emoji.animated ? 'a' : ''}:${packet.d.emoji.name}:${packet.d.emoji.id}>` : packet.d.emoji.name;
            const insertStmt = this.client.db.query('INSERT INTO reactions VALUES (?, ?, ?, ?, ?, ?, ?)');
            insertStmt.run(packet.d.guild_id, packet.d.channel_id, packet.d.message_id, packet.d.user_id, formedName, Date.now(), packet.t === 'MESSAGE_REACTION_ADD' ? 1 : 0);

            if (packet.t === 'MESSAGE_REACTION_REMOVE') return;

            const banned = reactionBans.get(packet.d.guild_id)!.find((ban: ReactionBan) => {
                ban.match = ban.match
                    .replaceAll('$$unicode$$', '\\u')
                    .replaceAll('$$UNICODE$$', '\\U');
                const regex = new RegExp(ban.match, 'gi');
                return regex.test(formedName) && ban.enabled && (ban.channels.includes(packet.d.channel_id) || !ban.ignoredChannels.includes(packet.d.channel_id));
            });
            if (banned) {
                if (banned.match === '') {
                    console.warn(`Reaction ban "${banned?.name}" has invalid or empty match`);
                    return;
                } else if (banned.match === '$$empty$$') {
                    banned.match = '';
                }

                let channel = this.client.channels.cache.get(packet.d.channel_id) as TextChannel;
                if (!channel) {
                    channel = await this.client.channels.fetch(packet.d.channel_id) as TextChannel;
                }

                let message = channel.messages.cache.get(packet.d.message_id);
                if (!message) {
                    message = await channel.messages.fetch(packet.d.message_id);
                    if (!message) return;
                }

                const user = await this.client.users.fetch(packet.d.user_id);
                if (!user) return;

                await message.reactions.resolve(packet.d.emoji.id || packet.d.emoji.name)?.users.remove(packet.d.user_id);
            }
        });
    }

    async onChatInteraction(interaction: ChatInputCommandInteraction) {
        if (!interaction.inGuild()) return;
        const serverConfig = getServerConfig(interaction.guildId);
        if (!serverConfig) return;

        const reactionBans: ReactionBan[] = serverConfig.interactions.reactions.bans;

        const subCommand = interaction.options.getSubcommand();
        if (subCommand === 'first') {
            const messageInput = interaction.options.getString('message', true);
            const messageId = parseMessageInput(messageInput);

            const embeds = await this.firstReactions(interaction.guildId, messageId);

            await interaction.reply({ embeds });
        } else if (subCommand === 'listbans') {
            // List all bans
            const enabledChunks = [];
            const disabledChunks = [];

            for (const ban of reactionBans) {
                const channels = interaction.guild?.channels.cache
                    .filter(channel => ban.channels.includes(channel.id));
                const channelNames = channels
                    ?.map(channel => channel.toString()).join(', ') ?? '';
                const ignoredChannels = interaction.guild?.channels.cache
                    .filter(channel => ban.ignoredChannels.includes(channel.id));
                const ignoredChannelNames = channels
                    ?.map(channel => channel.toString()).join(', ') ?? '';

                let chunk = `- ${ban.name}\n  `;

                if (channels?.size && ignoredChannels?.size) return;
                if (!channels?.size && !ignoredChannels?.size) {
                    chunk += 'Channels: all';
                } else if (channels?.size) {
                    chunk += 'Channels: ' + channelNames;
                } else if (ignoredChannels?.size) {
                    chunk += 'Ignored channels: ' + ignoredChannelNames;
                }
                if (ban.enabled) {
                    enabledChunks.push(chunk);
                } else {
                    disabledChunks.push(chunk);
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0xAA8ED6)
                .setTitle('Reaction Bans')
                .addFields([
                    {
                        name: 'Enabled',
                        value: enabledChunks.length > 0 ? enabledChunks.join('\n') : 'None',
                    },
                    {
                        name: 'Disabled',
                        value: disabledChunks.length > 0 ? disabledChunks.join('\n') : 'None',
                    },
                ]);

            await interaction.reply({ embeds: [embed] });
        }
    }

    /**
     * Returns embeds for the first reactions on a message
     * @param guildId The guild ID
     * @param messageId The message ID
     */
    async firstReactions(guildId: string, messageId: string): Promise<EmbedBuilder[]> {
        const stmt = this.client.db.query('SELECT * FROM reactions WHERE guild_id = ? AND message_id = ? ORDER BY timestamp ASC');
        const dbRes = stmt.all(guildId, messageId) as DBReaction[];

        if (dbRes.length === 0) {
            return [
                new EmbedBuilder()
                    .setColor(0xAA8ED6)
                    .setTitle('First reactions')
                    .setDescription('No reactions found.')
            ];
        }

        const groupedByEmoji: {
            [key: string]: {
                reactions: DBReaction[];
                netCount: number;
            };
        } = {};
        const firstReactions: {
            [key: string]: DBReaction[];
        } = {};

        dbRes.forEach((reaction: DBReaction) => {
            const emoji = reaction.emoji;
            if (!groupedByEmoji[emoji]) {
                groupedByEmoji[emoji] = { reactions: [], netCount: 0 };
            }
            groupedByEmoji[emoji].reactions.push(reaction);
        });

        for (const [emoji, data] of Object.entries(groupedByEmoji)) {
            data.reactions.forEach(reaction => {
                data.netCount += reaction.added === 1 ? 1 : -1;

                if (data.netCount === 1) {
                    if (!firstReactions[emoji]) {
                        firstReactions[emoji] = [];
                    }
                    firstReactions[emoji].push(reaction);
                }
            });
        }
        const entries: string[] = [];

        for (const [emoji, reactions] of Object.entries(firstReactions)) {
            reactions.forEach(reaction => {
                let chunk = `<t:${Math.floor(reaction.timestamp / 1000)}:T> `;
                if (emoji.startsWith('<')) {
                    const { id, name, animated } = parseEmojiString(emoji);
                    const ext = animated ? 'gif' : 'png';
                    const link = `https://cdn.discordapp.com/emojis/${id}.${ext}`;
                    chunk += `[\`${animated ? 'a' : ''}:${name}:\`](${link})`;
                } else {
                    chunk += emoji;
                }
                chunk += ` by <@${reaction.reactor_id}>\n`;
                entries.push(chunk);
            });
        }

        const embedChunks: string[] = [];
        const maxChunkLength = 3900;

        let chunk = '';

        for (const entry of entries) {
            if (chunk.length + entry.length > maxChunkLength) {
                embedChunks.push(chunk);
                chunk = '';
            }
            chunk += entry;
        }

        if (chunk.length > 0) {
            embedChunks.push(chunk);
        }

        const embeds: EmbedBuilder[] = [];

        for (let i = 0; i < embedChunks.length; i++) {
            let embed = new EmbedBuilder()
                .setColor(0xAA8ED6)
                .setDescription(embedChunks[i]);
            if (i === 0) {
                embed = embed.setTitle('First reactions');
            }
            embeds.push(embed);
        }

        return embeds;
    }
}

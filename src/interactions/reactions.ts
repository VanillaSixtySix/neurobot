import { ApplicationCommandType, AutocompleteInteraction, ChatInputCommandInteraction, ContextMenuCommandBuilder, EmbedBuilder, Events, MessageContextMenuCommandInteraction, PermissionFlagsBits, SlashCommandBuilder, TextChannel } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import { parseEmojiString, parseMessageInput } from '../utils';
import config from '../../config.toml';

interface RawPacket<T> {
    t: string;
    d: T;
}

interface RawPacketReactionData {
    /** The ID of the user who owns/owned the reaction */
    user_id: string;
    message_id: string;
    guild_id: string;
    channel_id: string;
    emoji: {
        name: string;
        id: string;
        animated: boolean | undefined;
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

interface DBReactionBan {
    id: number;
    guild_id: string;
    emoji: string;
    enabled: 0 | 1;
}

export default class Reactions implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new SlashCommandBuilder()
            .setName('reactions')
            .setDescription('Utilities for handling reactions')
            .setDMPermission(false)
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
                    .setName('ban')
                    .setDescription('Bans a reaction')
                    .addStringOption(option =>
                        option
                            .setName('emoji')
                            .setDescription('The emoji name or ID to ban')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subCommand =>
                subCommand
                    .setName('unban')
                    .setDescription('Unbans a reaction')
                    .addStringOption(option =>
                        option
                            .setName('emoji')
                            .setDescription('The emoji name or ID to unban')
                            .setAutocomplete(true)
                            .setRequired(true)
                    )
            )
            .addSubcommand(subCommand =>
                subCommand
                    .setName('listbans')
                    .setDescription('Lists all bans')
            )
            .addSubcommand(subCommand =>
                subCommand
                    .setName('enableban')
                    .setDescription('Enables a previously disabled ban')
                    .addStringOption(option =>
                        option
                            .setName('emoji')
                            .setDescription('The emoji name or ID to enable')
                            .setAutocomplete(true)
                            .setRequired(true)
                    )
            )
            .addSubcommand(subCommand =>
                subCommand
                    .setName('disableban')
                    .setDescription('Disables a ban without deleting')
                    .addStringOption(option =>
                        option
                            .setName('emoji')
                            .setDescription('The emoji name or ID to disable')
                            .setAutocomplete(true)
                            .setRequired(true)
                    )
            ),
        new ContextMenuCommandBuilder()
            .setName('Log First Reactions')
            .setType(ApplicationCommandType.Message)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    ];

    reactionBanCache: Map<string, DBReactionBan[]> = new Map();

    async init() {
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
        this.client.db.exec(`
            CREATE TABLE IF NOT EXISTS reaction_bans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                emoji TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                UNIQUE(guild_id, emoji)
            )
        `);

        // Fill reaction ban cache
        const bans = this.client.db.query('SELECT * FROM reaction_bans').all() as DBReactionBan[];
        for (const ban of bans) {
            if (!this.reactionBanCache.has(ban.guild_id)) {
                this.reactionBanCache.set(ban.guild_id, []);
            }
            this.reactionBanCache.get(ban.guild_id)!.push(ban);
        }

        this.client.on(Events.Raw, async (packet: RawPacket<RawPacketReactionData>) => {
            if (packet.t !== 'MESSAGE_REACTION_ADD' && packet.t !== 'MESSAGE_REACTION_REMOVE') return;
            if (typeof packet.d.guild_id === 'undefined') return;

            const formedName = packet.d.emoji.id != null ? `<${packet.d.emoji.animated ? 'a' : ''}:${packet.d.emoji.name}:${packet.d.emoji.id}>` : packet.d.emoji.name;
            const insertStmt = this.client.db.query('INSERT INTO reactions VALUES (?, ?, ?, ?, ?, ?, ?)');
            insertStmt.run(packet.d.guild_id, packet.d.channel_id, packet.d.message_id, packet.d.user_id, formedName, Date.now(), packet.t === 'MESSAGE_REACTION_ADD' ? 1 : 0);

            if (packet.t === 'MESSAGE_REACTION_REMOVE') return;

            const banned = this.reactionBanCache.get(packet.d.guild_id)?.some(ban => {
                const regex = new RegExp(ban.emoji, 'gi');
                return regex.test(formedName) && ban.enabled === 1;
            });
            if (!banned) return;

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
        });
    }

    async onAutocomplete(interaction: AutocompleteInteraction) {
        const subCommand = interaction.options.getSubcommand();

        let options: { name: string; value: string; }[] = [];

        if (subCommand === 'unban') {
            const emoji = interaction.options.getString('emoji', true);
            const stmt = this.client.db.query('SELECT * FROM reaction_bans WHERE guild_id = ? AND emoji LIKE ?');
            const dbRes = stmt.all(interaction.guildId, `%${emoji}%`) as DBReactionBan[];

            options = dbRes.map(res => ({
                name: res.emoji,
                value: res.emoji.toString(),
            }));
        } else if (subCommand === 'enableban' || subCommand === 'disableban') {
            const emoji = interaction.options.getString('emoji', true);
            const showEnabled = subCommand === 'disableban';
            const stmt = this.client.db.query('SELECT * FROM reaction_bans WHERE guild_id = ? AND emoji LIKE ? AND enabled = ?');
            const dbRes = stmt.all(interaction.guildId, `%${emoji}%`, showEnabled) as DBReactionBan[];

            options = dbRes.map(res => ({
                name: res.emoji,
                value: res.emoji.toString(),
            }));
        }
        await interaction.respond(options);
    }

    async onChatInteraction(interaction: ChatInputCommandInteraction) {
        if (!interaction.inGuild()) return;

        let reloadCache = false;

        const subCommand = interaction.options.getSubcommand();
        if (subCommand === 'first') {
            const messageInput = interaction.options.getString('message', true);
            const messageId = parseMessageInput(messageInput);

            const embeds = await this.firstReactions(interaction.guildId, messageId);

            await interaction.reply({ embeds });
        } else if (subCommand === 'ban') {
            // Verify emoji is not already banned and insert into reaction_bans
            const emoji = interaction.options.getString('emoji', true);

            const exists = this.emojiBanExists(interaction.guildId, emoji);
            if (exists) {
                await interaction.reply(`Emoji \`${emoji}\` is already banned.`);
                return;
            }

            const insertStmt = this.client.db.query('INSERT INTO reaction_bans (guild_id, emoji) VALUES (?, ?)');
            insertStmt.run(interaction.guildId, emoji);
            reloadCache = true;

            await interaction.reply(`Ban created for emoji \`${emoji}\`.`);
        } else if (subCommand === 'unban') {
            // Verify ban exists and delete from reaction_bans
            const emoji = interaction.options.getString('emoji', true);

            const exists = this.emojiBanExists(interaction.guildId, emoji);
            if (!exists) {
                await interaction.reply('Ban not found.');
                return;
            }

            const deleteStmt = this.client.db.query('DELETE FROM reaction_bans WHERE guild_id = ? AND emoji = ?');
            deleteStmt.run(interaction.guildId, emoji);
            reloadCache = true;

            await interaction.reply(`Ban for emoji \`${emoji}\` removed.`);
        } else if (subCommand === 'listbans') {
            // List all bans
            const selectStmt = this.client.db.query('SELECT * FROM reaction_bans WHERE guild_id = ? ORDER BY id ASC');
            const dbRes = selectStmt.all(interaction.guildId) as DBReactionBan[];

            const enabledChunks = [];
            const disabledChunks = [];

            for (const ban of dbRes) {
                const chunk = '- `' + ban.emoji + '`';
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
        } else if (subCommand === 'enableban') {
            // Verify emoji exists and set enabled to 1
            const emoji = interaction.options.getString('emoji', true);

            const exists = this.emojiBanExists(interaction.guildId, emoji);
            if (!exists) {
                await interaction.reply('Ban not found.');
                return;
            }

            const updateStmt = this.client.db.query('UPDATE reaction_bans SET enabled = 1 WHERE guild_id = ? AND emoji = ?');
            updateStmt.run(interaction.guildId, emoji);
            reloadCache = true;

            await interaction.reply('Ban enabled.');
        } else if (subCommand === 'disableban') {
            // Verify emoji exists and set enabled to 0
            const emoji = interaction.options.getString('emoji', true);

            const exists = this.emojiBanExists(interaction.guildId, emoji);
            if (!exists) {
                await interaction.reply('Ban not found.');
                return;
            }

            const updateStmt = this.client.db.query('UPDATE reaction_bans SET enabled = 0 WHERE guild_id = ? AND emoji = ?');
            updateStmt.run(interaction.guildId, emoji);
            reloadCache = true;

            await interaction.reply('Ban disabled.');
        } else if (subCommand === 'reloadbans') {
            // Reload bans
            reloadCache = true;

            await interaction.reply('Bans reloaded.');
        }

        if (reloadCache) {
            this.reloadBanCache(interaction.guildId);
        }
    }

    async onContextMenuInteraction(interaction: MessageContextMenuCommandInteraction) {
        if (!interaction.inGuild()) return;

        const interactionConfig = config.interactions.utility.info;

        const message = interaction.targetMessage;

        const outChannel = await message.client.channels.fetch(interactionConfig.logChannel);
        if (!outChannel?.isTextBased()) {
            console.warn(`Channel ${interactionConfig.logChannel} is not a text channel`);
            await interaction.reply({ content: 'An error occurred executing this interaction - output channel set incorrectly.', ephemeral: true });
            return;
        }

        const content = `First reactions requested by ${interaction.user} in ${message.channel}`;
        const embeds = await this.firstReactions(interaction.guildId, message.id);
        await outChannel.send({ content, embeds });

        await interaction.reply({ content: `First reactions sent to ${outChannel}`, ephemeral: true });
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

        const channelId = dbRes[0].channel_id;

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
        const firstDescription = `[Jump to message](https://discord.com/channels/${guildId}/${channelId}/${messageId})\n\n`;

        for (let i = 0; i < embedChunks.length; i++) {
            let embed = new EmbedBuilder()
                .setColor(0xAA8ED6)
                .setDescription(`${i === 0 ? firstDescription : ''}${embedChunks[i]}`);
            if (i === 0) {
                embed = embed.setTitle('First reactions');
            }
            embeds.push(embed);
        }

        return embeds;
    }

    /**
     * Queries reaction_bans to see whether the ban with the given emoji exists
     * @param guildId The guild ID
     * @param emoji The emoji to check
     * @returns Whether the reaction ban exists
     */
    private emojiBanExists(guildId: string, emoji: string): boolean {
        const stmt = this.client.db.query(`SELECT 1 FROM reaction_bans WHERE guild_id = ? AND emoji = ?`);
        const res = stmt.get(guildId, emoji) as 1 | null;
        return !!res;
    }

    /**
     * Reloads the reaction ban cache for the given guild
     * @param guildId The guild ID
     */
    private reloadBanCache(guildId: string) {
        const stmt = this.client.db.query('SELECT * FROM reaction_bans WHERE guild_id = ?');
        const bans = stmt.all(guildId) as DBReactionBan[];
        this.reactionBanCache.set(guildId, bans);
    }
}

import { ApplicationCommandType, AutocompleteInteraction, ChatInputCommandInteraction, ContextMenuCommandBuilder, EmbedBuilder, Events, MessageContextMenuCommandInteraction, PermissionFlagsBits, SlashCommandBuilder, TextChannel } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import { RawPacket, parseEmojiString, parseMessageInput } from '../utils';
import config from '../../config.toml';

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

interface DBReactionBan {
    id: number;
    guild_id: string;
    // comma-separated
    channel_ids?: string;
    emoji: string;
    enabled: 0 | 1;
}

interface DBReactionNotificationGroup {
    guild_id: string;
    emoji: string;
    threshold: number;
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
                    .addStringOption(option =>
                        option
                            .setName('channels')
                            .setDescription('The channel IDs to ban the emoji in')
                            .setRequired(false)
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
                    .addStringOption(option =>
                        option
                            .setName('channels')
                            .setDescription('The channel IDs to unban the emoji in')
                            .setRequired(false)
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
                    .addStringOption(option =>
                        option
                            .setName('channels')
                            .setDescription('The channel IDs to enable the emoji in')
                            .setRequired(false)
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
                    .addStringOption(option =>
                        option
                            .setName('channels')
                            .setDescription('The channel IDs to disable the emoji in')
                            .setRequired(false)
                    )
            )
            .addSubcommandGroup(subCommandGroup =>
                subCommandGroup
                    .setName('notify')
                    .setDescription('Notification settings for reactions')
                    .addSubcommand(subCommand =>
                        subCommand
                            .setName('add')
                            .setDescription('Adds a notification for a reaction')
                            .addStringOption(option =>
                                option
                                    .setName('emoji')
                                    .setDescription('The emoji name or ID to notify for - MAKE IT SPECIFIC!')
                                    .setRequired(true)
                            )
                            .addIntegerOption(option =>
                                option
                                    .setName('threshold')
                                    .setDescription('The threshold for the notification')
                                    .setRequired(true)
                            )
                    )
                    .addSubcommand(subCommand =>
                        subCommand
                            .setName('remove')
                            .setDescription('Removes a notification for a reaction')
                            .addStringOption(option =>
                                option
                                    .setName('emoji')
                                    .setDescription('The emoji name or ID to remove')
                                    .setRequired(true)
                                    .setAutocomplete(true)
                            )
                    )
                    .addSubcommand(subCommand =>
                        subCommand
                            .setName('list')
                            .setDescription('Lists all notification groups')
                    )
            ),
        new ContextMenuCommandBuilder()
            .setName('Log First Reactions')
            .setType(ApplicationCommandType.Message)
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    ];

    reactionBanCache: Map<string, DBReactionBan[]> = new Map();
    reactionNotificationGroupCache: Map<string, { emoji: string; threshold: number; }[]> = new Map();

    editQueue: (() => Promise<void>)[] = [];

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
                channel_ids TEXT,
                emoji TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                UNIQUE(guild_id, emoji)
            )
        `);
        this.client.db.exec(`
            CREATE TABLE IF NOT EXISTS reaction_notification_groups (
                guild_id TEXT NOT NULL,
                emoji TEXT NOT NULL,
                threshold INTEGER NOT NULL,
                UNIQUE(guild_id, emoji)
            )
        `);
        this.client.db.exec(`
            CREATE TABLE IF NOT EXISTS reaction_notifications (
                guild_id TEXT NOT NULL,
                emoji TEXT NOT NULL,
                message_id TEXT NOT NULL,
                notification_message_id TEXT NOT NULL,
                UNIQUE(guild_id, emoji, message_id)
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

        // Fill reaction notification cache
        const notificationGroups = this.client.db.query('SELECT * FROM reaction_notification_groups').all() as DBReactionNotificationGroup[];
        for (const notificationGroup of notificationGroups) {
            if (!this.reactionNotificationGroupCache.has(notificationGroup.guild_id)) {
                this.reactionNotificationGroupCache.set(notificationGroup.guild_id, []);
            }
            this.reactionNotificationGroupCache.get(notificationGroup.guild_id)!.push(notificationGroup);
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
                return regex.test(formedName) && ban.enabled === 1 && (!ban.channel_ids || ban.channel_ids.split(',').includes(packet.d.channel_id));
            });
            const notificationGroup = this.reactionNotificationGroupCache.get(packet.d.guild_id)?.find(notification => {
                const regex = new RegExp(notification.emoji, 'gi');
                return regex.test(formedName);
            });
            if (banned) {
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
            } else if (typeof notificationGroup !== 'undefined') {
                // a notification group matches the reacted emoji, so:
                // 1. see if the reactions for this message meet the threshold
                // 2. see if a notification message was already sent
                //     if so, edit the message
                //     otherwise, send a new message and store the ID
                // unfortunately, this is prone to desync because we aren't fetching the message
                const reactionsStmt = this.client.db.query('SELECT message_id, reactor_id, added FROM reactions WHERE guild_id = ? AND message_id = ? AND emoji LIKE ? ORDER BY timestamp ASC');
                const reactionsDBRes = reactionsStmt.all(packet.d.guild_id, packet.d.message_id, `%${formedName}%`) as { message_id: string; reactor_id: string; added: 0 | 1; }[];
                const reduced = reactionsDBRes.reduce((acc, res) => {
                    if (res.added === 1) {
                        acc[res.reactor_id] = (acc[res.reactor_id] ?? 0) + 1;
                    } else {
                        acc[res.reactor_id] = (acc[res.reactor_id] ?? 0) - 1;
                    }
                    return acc;
                }, {} as { [id: string]: number; });
                const reactionCount = Object.values(reduced).reduce((acc, val) => acc + val, 0);

                const notificationsStmt = this.client.db.query('SELECT notification_message_id FROM reaction_notifications WHERE guild_id = ? AND message_id = ? AND emoji LIKE ?');
                const notificationsDBRes = notificationsStmt.get(packet.d.guild_id, packet.d.message_id, `%${formedName}%`) as { notification_message_id: string; };
                // if notificationsDBRes is null, send a new message, otherwise edit with id

                const threshold = notificationGroup!.threshold;

                if (reactionCount >= threshold) {
                    let originalChannel = this.client.channels.cache.get(packet.d.channel_id) as TextChannel;
                    if (!originalChannel) {
                        originalChannel = await this.client.channels.fetch(packet.d.channel_id) as TextChannel;
                        if (!originalChannel) return;
                    }

                    let originalMessage = originalChannel.messages.cache.get(packet.d.message_id);
                    if (!originalMessage) {
                        originalMessage = await originalChannel.messages.fetch(packet.d.message_id);
                        if (!originalMessage) return;
                    }

                    const destinationChannelId = config.interactions.reactions.notificationChannel;
                    let destinationChannel = this.client.channels.cache.get(destinationChannelId) as TextChannel;
                    if (!destinationChannel) {
                        destinationChannel = await this.client.channels.fetch(destinationChannelId) as TextChannel;
                        if (!destinationChannel) {
                            console.warn(`Reaction notification destination ${destinationChannelId} not found`);
                            return;
                        }
                    }

                    const content = `Reaction notification threshold reached; [Jump to message](${originalMessage.url})`;

                    const reactionImage = formedName.startsWith('<') ? `https://cdn.discordapp.com/emojis/${packet.d.emoji.id}.${packet.d.emoji.animated ? 'gif' : 'png'}` : undefined;

                    const embed = new EmbedBuilder()
                        .setColor(0xAA8ED6)
                        .setAuthor({ name: `${originalMessage.author.tag} (${originalMessage.author.id})`, iconURL: originalMessage.author.displayAvatarURL() })
                        .setDescription(originalMessage.content || '*(No content)*')
                        .setFooter({ text: `${!reactionImage ? formedName + ' — ': ''}${reactionCount}/${threshold}`, iconURL: reactionImage });

                    if (notificationsDBRes) {
                        // edit message
                        this.editQueue.push(async () => {
                            // TODO: this is now in the queue - what if destinationChannel was deleted before it's processed?
                            let notificationMessage = destinationChannel.messages.cache.get(notificationsDBRes.notification_message_id);
                            if (!notificationMessage) {
                                notificationMessage = await destinationChannel.messages.fetch(notificationsDBRes.notification_message_id);
                                // if message wasn't found, but it's in the db, maybe it was deleted? just ignore
                                if (!notificationMessage) return;
                            }
                            await notificationMessage.edit({ content, embeds: [embed] });
                        });
                    } else {
                        // send message
                        const notificationMessage = await destinationChannel.send({ content, embeds: [embed] });

                        const insertStmt = this.client.db.query('INSERT INTO reaction_notifications VALUES (?, ?, ?, ?)');
                        insertStmt.run(packet.d.guild_id, formedName, packet.d.message_id, notificationMessage.id);
                    }
                }
            }
        });

        // process notification edits
        setInterval(() => {
            if (this.editQueue.length === 0) return;
            const func = this.editQueue.shift()!;
            func();
        }, 1000);
    }

    async onAutocomplete(interaction: AutocompleteInteraction) {
        const subCommand = interaction.options.getSubcommand();
        const subCommandGroup = interaction.options.getSubcommandGroup();

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
        } else if (subCommandGroup === 'notify') {
            if (subCommand === 'remove') {
                const emoji = interaction.options.getString('emoji', true);
                const stmt = this.client.db.query('SELECT * FROM reaction_notification_groups WHERE guild_id = ? AND emoji LIKE ?');
                const dbRes = stmt.all(interaction.guildId, `%${emoji}%`) as DBReactionNotificationGroup[];

                options = dbRes.map(res => ({
                    name: res.emoji,
                    value: res.emoji.toString(),
                }));
            }
        }
        await interaction.respond(options);
    }

    async onChatInteraction(interaction: ChatInputCommandInteraction) {
        if (!interaction.inGuild()) return;

        let reloadCaches = false;

        const subCommand = interaction.options.getSubcommand();
        const subCommandGroup = interaction.options.getSubcommandGroup();
        if (subCommand === 'first') {
            const messageInput = interaction.options.getString('message', true);
            const messageId = parseMessageInput(messageInput);

            const embeds = await this.firstReactions(interaction.guildId, messageId);

            await interaction.reply({ embeds });
        } else if (subCommand === 'ban') {
            // Verify emoji is not already banned and insert into reaction_bans
            const emoji = interaction.options.getString('emoji', true);
            const channelIds = interaction.options.getString('channels');

            const exists = this.emojiBanExists(interaction.guildId, emoji, channelIds);
            if (exists) {
                await interaction.reply(`Emoji \`${emoji}\` is already banned.`);
                return;
            }

            const insertStmt = this.client.db.query(`INSERT INTO reaction_bans (guild_id, emoji, channel_ids) VALUES (?, ?, ?)`);
            insertStmt.run(interaction.guildId, emoji, channelIds);
            reloadCaches = true;

            await interaction.reply(`Ban created for emoji \`${emoji}\`${channelIds ?? ' in channel IDs `' + channelIds + '`'}.`);
        } else if (subCommand === 'unban') {
            // Verify ban exists and delete from reaction_bans
            const emoji = interaction.options.getString('emoji', true);
            const channelIds = interaction.options.getString('channels');

            const exists = this.emojiBanExists(interaction.guildId, emoji, channelIds);
            if (!exists) {
                await interaction.reply('Ban not found.');
                return;
            }

            const deleteStmt = this.client.db.query(`DELETE FROM reaction_bans WHERE guild_id = ? AND emoji = ? AND channel_ids = ?`);
            deleteStmt.run(interaction.guildId, emoji, channelIds);
            reloadCaches = true;

            await interaction.reply(`Ban for emoji \`${emoji}\` removed${channelIds ?? ' from channel IDs `' + channelIds + '`'}.`);
        } else if (subCommand === 'listbans') {
            // List all bans
            const selectStmt = this.client.db.query('SELECT * FROM reaction_bans WHERE guild_id = ? ORDER BY id ASC');
            const dbRes = selectStmt.all(interaction.guildId) as DBReactionBan[];

            const enabledChunks = [];
            const disabledChunks = [];

            for (const ban of dbRes) {
                const chunk = '- `' + ban.emoji + '`' + (ban.channel_ids && (' (`' + ban.channel_ids + '`)') || '');
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
            const channelIds = interaction.options.getString('channels');

            const exists = this.emojiBanExists(interaction.guildId, emoji, channelIds);
            if (!exists) {
                await interaction.reply('Ban not found.');
                return;
            }

            const updateStmt = this.client.db.query(`UPDATE reaction_bans SET enabled = 1 WHERE guild_id = ? AND emoji = ? AND channel_ids = ?`);
            updateStmt.run(interaction.guildId, emoji, channelIds);
            reloadCaches = true;

            await interaction.reply('Ban enabled.');
        } else if (subCommand === 'disableban') {
            // Verify emoji exists and set enabled to 0
            const emoji = interaction.options.getString('emoji', true);
            const channelIds = interaction.options.getString('channels');

            const exists = this.emojiBanExists(interaction.guildId, emoji, channelIds);
            if (!exists) {
                await interaction.reply('Ban not found.');
                return;
            }

            const updateStmt = this.client.db.query(`UPDATE reaction_bans SET enabled = 0 WHERE guild_id = ? AND emoji = ? AND channel_ids = ?`);
            updateStmt.run(interaction.guildId, emoji, channelIds);
            reloadCaches = true;

            await interaction.reply('Ban disabled.');
        } else if (subCommandGroup === 'notify') {
            if (subCommand === 'add') {
                const emoji = interaction.options.getString('emoji', true);
                const threshold = interaction.options.getInteger('threshold', true);

                const insertStmt = this.client.db.query('INSERT INTO reaction_notification_groups VALUES (?, ?, ?)');
                insertStmt.run(interaction.guildId, emoji, threshold);
                reloadCaches = true;

                await interaction.reply(`Notification added for \`${emoji}\` at threshold \`${threshold}\`.`);
            } else if (subCommand === 'remove') {
                const emoji = interaction.options.getString('emoji', true);

                const deleteStmt = this.client.db.query('DELETE FROM reaction_notification_groups WHERE guild_id = ? AND emoji = ?');
                deleteStmt.run(interaction.guildId, emoji);
                reloadCaches = true;

                await interaction.reply(`Notification removed for \`${emoji}\`.`);
            } else if (subCommand === 'list') {
                const selectStmt = this.client.db.query('SELECT * FROM reaction_notification_groups WHERE guild_id = ?');
                const dbRes = selectStmt.all(interaction.guildId) as { emoji: string; threshold: number; }[];

                const chunks = dbRes.map(res => `- \`${res.emoji}\` at threshold \`${res.threshold}\``);

                const embed = new EmbedBuilder()
                    .setColor(0xAA8ED6)
                    .setTitle('Reaction Notifications')
                    .setDescription(chunks.length > 0 ? chunks.join('\n') : 'None');

                await interaction.reply({ embeds: [embed] });
            }
        }

        if (reloadCaches) {
            this.reloadBanCache(interaction.guildId);
            this.reloadNotificationCache(interaction.guildId);
        }
    }

    async onContextMenuInteraction(interaction: MessageContextMenuCommandInteraction) {
        if (!interaction.inGuild()) return;

        const interactionConfig = config.interactions.info;

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
     * @param channelIds The channel IDs to check
     * @returns Whether the reaction ban exists
     */
    private emojiBanExists(guildId: string, emoji: string, channelIds: string | null): boolean {
        const stmt = this.client.db.query(`SELECT 1 FROM reaction_bans WHERE guild_id = ? AND emoji = ? AND channel_ids = ?`);
        const res = stmt.get(guildId, emoji, channelIds) as 1 | null;
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

    /**
     * Reloads the reaction notification cache for the given guild
     * @param guildId The guild ID
     */
    private reloadNotificationCache(guildId: string) {
        const stmt = this.client.db.query('SELECT * FROM reaction_notification_groups WHERE guild_id = ?');
        const notifications = stmt.all(guildId) as DBReactionNotificationGroup[];
        this.reactionNotificationGroupCache.set(guildId, notifications);
    }
}

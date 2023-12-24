import { ApplicationCommandType, AutocompleteInteraction, ChatInputCommandInteraction, ContextMenuCommandBuilder, EmbedBuilder, Events, MessageContextMenuCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import { parseMessageInput } from '../utils';
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
                            .setAutocomplete(true)
                    )
            )
            .addSubcommand(subCommand =>
                subCommand
                    .setName('unban')
                    .setDescription('Unbans a reaction')
                    .addStringOption(option =>
                        option
                            .setName('emoji')
                            .setDescription('The index of the ban to remove')
                            .setAutocomplete(true)
                    )
            )
            .addSubcommand(subCommand =>
                subCommand
                    .setName('list')
                    .setDescription('Lists all bans')
            )
            .addSubcommand(subCommand =>
                subCommand
                    .setName('enable')
                    .setDescription('Enables a previously disabled ban')
                    .addIntegerOption(option =>
                        option
                            .setName('index')
                            .setDescription('The index of the ban to enable')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subCommand =>
                subCommand
                    .setName('disable')
                    .setDescription('Disables a ban without deleting')
                    .addIntegerOption(option =>
                        option
                            .setName('index')
                            .setDescription('The index of the ban to disable')
                            .setRequired(true)
                    )
            ),
        new ContextMenuCommandBuilder()
            .setName('Log First Reactions')
            .setType(ApplicationCommandType.Message)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    ];

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

        this.client.on(Events.Raw, async (packet: RawPacket<RawPacketReactionData>) => {
            if (packet.t !== 'MESSAGE_REACTION_ADD' && packet.t !== 'MESSAGE_REACTION_REMOVE') {
                return;
            }

            const formedName = packet.d.emoji.id != null ? `<${packet.d.emoji.animated ? 'a' : ''}:${packet.d.emoji.name}:${packet.d.emoji.id}>` : packet.d.emoji.name;
            const stmt = this.client.db.query('INSERT INTO reactions VALUES (?, ?, ?, ?, ?, ?)');
            stmt.run(packet.d.guild_id, packet.d.message_id, packet.d.user_id, formedName, Date.now(), packet.t === 'MESSAGE_REACTION_ADD' ? 1 : 0);
        });
    }

    async autocomplete(interaction: AutocompleteInteraction) {
        const focusedOption = interaction.options.getFocused(true);

        let choices: string[] = [];

        if (focusedOption.name === 'testoption') {
            choices = ['autocomplete option one', 'autocomplete option two', 'heheheha'];
        }

        const filtered = choices.filter(choice => choice.startsWith(focusedOption.value));
        await interaction.respond(
            filtered.map(choice => ({ name: choice, value: choice })),
        );
    }

    async executeChat(interaction: ChatInputCommandInteraction) {
        if (!interaction.inGuild()) return;

        const subCommand = interaction.options.getSubcommand();

        if (subCommand === 'first') {
            const messageInput = interaction.options.getString('message', true);
            const messageId = parseMessageInput(messageInput);

            const embeds = await this.firstReactions(interaction.guildId, messageId);

            await interaction.reply({ embeds });
            return;
        } else if (subCommand === 'ban') {
            const emoji = interaction.options.getString('emoji', true);
            await interaction.reply(`ban; emoji is \`${emoji}\``);
            return;
        } else if (subCommand === 'unban') {
            const emoji = interaction.options.getString('emoji', true);
            await interaction.reply(`unban; emoji is \`${emoji}\``);
            return;
        } else if (subCommand === 'list') {
            await interaction.reply('list');
            return;
        } else if (subCommand === 'enable') {
            const index = interaction.options.getInteger('index', true);
            await interaction.reply(`enable; index is \`${index}\``);
            return;
        } else if (subCommand === 'disable') {
            const index = interaction.options.getInteger('index', true);
            await interaction.reply(`disable; index is \`${index}\``);
            return;
        }
        await interaction.reply(`subcommand: \`${subCommand}\``);
    }

    async executeContextMenu(interaction: MessageContextMenuCommandInteraction) {
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
                    const match = emoji.match(/<.*:(.+):(\d+)>/);
                    if (match) {
                        const name = match[1];
                        const id = match[2];
                        const animated = emoji.startsWith('<a');
                        const ext = animated ? 'gif' : 'png';
                        const link = `https://cdn.discordapp.com/emojis/${id}.${ext}`;
                        chunk += `[\`${animated ? 'a' : ''}:${name}:\`](${link})`;
                    }
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
            const embed = new EmbedBuilder()
                .setColor(0xAA8ED6)
                .setTitle('First reactions')
                .setDescription(`${i === 0 ? firstDescription : ''}${embedChunks[i]}`);
            embeds.push(embed);
        }

        return embeds;
    }
}

import { AutocompleteInteraction, ChatInputCommandInteraction, Events, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';

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
    };
}

export default {
    data: new SlashCommandBuilder()
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
    async init(client: BotClient) {
        client.db.exec(`
            CREATE TABLE IF NOT EXISTS reactions (
                guild_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                reactor_id TEXT NOT NULL,
                emoji TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            )
        `);

        client.on(Events.Raw, async (packet: RawPacket<RawPacketReactionData>) => {
            if (packet.t === 'MESSAGE_REACTION_ADD') {
                const stmt = client.db.query('INSERT INTO reactions VALUES (?, ?, ?, ?, ?, 1)');
                stmt.run(packet.d.guild_id, packet.d.message_id, packet.d.user_id, packet.d.emoji.name, Date.now());
            } else if (packet.t === 'MESSAGE_REACTION_REMOVE') {
                const stmt = client.db.query('UPDATE reactions SET active = 0 WHERE guild_id = ? AND message_id = ? AND reactor_id = ? AND emoji = ?');
                stmt.run(packet.d.guild_id, packet.d.message_id, packet.d.user_id, packet.d.emoji.name);
            }
        });

    },
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
    },
    async execute(interaction: ChatInputCommandInteraction) {
        const subCommand = interaction.options.getSubcommand();
        const client = interaction.client as BotClient;

        if (subCommand === 'first') {
            const message = interaction.options.getString('message', true);
            const stmt = client.db.query('SELECT * FROM reactions WHERE guild_id = ? AND message_id = ? ORDER BY timestamp ASC');
            const dbRes = stmt.all(interaction.guildId, message) as any;
            // console.debug(dbRes);
            const groupedByReactor = dbRes.reduce((acc: any, cur: any) => {
                if (acc[cur.reactor_id] == null) {
                    acc[cur.reactor_id] = [];
                }
                acc[cur.reactor_id].push(cur);
                return acc;
            }, {} as Record<string, typeof dbRes>);
            console.debug(groupedByReactor);

            let response = '';

            for (const [reactorId, reactions] of Object.entries(groupedByReactor)) {
                const reactor = await client.users.fetch(reactorId);
                if (reactor == null) {
                    console.warn(`User ${reactorId} not found`);
                    continue;
                }
                response += `**${reactor.tag}**\n`;
                for (const reaction of reactions as any[]) {
                    response += `${reaction.emoji} <t:${Math.floor(reaction.timestamp / 1000)}:T>\n`;
                }
            }

            await interaction.reply(response);
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
        // } else if (subCommand === 'test') {
        //     const testoption = interaction.options.getString('testoption');
        //     if (testoption == null) {
        //         await interaction.reply('test; no options provided');
        //         return;
        //     }
        //     await interaction.reply(`test; testoption is \`${testoption}\``);
        //     return;
        // }
        await interaction.reply(`subcommand: \`${subCommand}\``);
    },
} as BotInteraction;

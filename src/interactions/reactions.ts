import { Database } from 'bun:sqlite';
import { AutocompleteInteraction, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import config from '../../../config.toml';

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
    init(db: Database) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS reaction_bans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                emoji TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1
            )
        `);
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

        if (subCommand === 'first') {
            const message = interaction.options.getString('message', true);
            await interaction.reply(`first; message is \`${message}\``);
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

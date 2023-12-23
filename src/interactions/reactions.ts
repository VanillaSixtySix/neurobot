import { Database } from 'bun:sqlite';
import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import config from '../../../config.toml';

export default {
    data: new SlashCommandBuilder()
        .setName('reactions')
        .setDescription('Reactions utility')
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
                .setName('test')
                .setDescription('Test subcommand')
                .addStringOption(option => 
                    option
                        .setName('testoption')
                        .setDescription('This is a test option')
                        .setAutocomplete(true)
                )
        ),
    init(db: Database) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS reactions (
                message_id INTEGER NOT NULL,
                channel_id INTEGER NOT NULL,
                guild_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                emoji TEXT NOT NULL,
                removed INTEGER DEFAULT 0,
                nth INTEGER NOT NULL,
                time INTEGER NOT NULL,
                hit_groups TEXT,
                PRIMARY KEY (message_id, channel_id, guild_id, emoji, time)
            );
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS reaction_groups (
                guild_id INTEGER NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                name TEXT NOT NULL,
                match TEXT NOT NULL,
                match_type INTEGER NOT NULL DEFAULT 0,
                builtin INTEGER NOT NULL DEFAULT 0,
                channel_list_type INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (guild_id, name)
            )
        `);
        db.exec(`
            INSERT OR REPALCE INTO reaction_groups (guild_id, name, match, builtin)
            VALUES (?, ?, ?, ?)
        `, [config.interactions.reactions, 'Country Flags', '[\U0001F1E6-\U0001F1FF]{2}', 1]);
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
        } else if (subCommand === 'test') {
            const testoption = interaction.options.getString('testoption');
            if (testoption == null) {
                await interaction.reply('test; no options provided');
                return;
            }
            await interaction.reply(`test; testoption is \`${testoption}\``);
            return;
        }
        await interaction.reply(`subcommand: \`${subCommand}\``);
    },
} as BotInteraction;

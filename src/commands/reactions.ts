import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { BotCommand } from '../classes/BotCommand';

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
} as BotCommand;

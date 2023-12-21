import { AutocompleteInteraction, ChatInputCommandInteraction, ContextMenuCommandInteraction, SlashCommandBuilder } from 'discord.js';

export interface BotCommand {
    data: SlashCommandBuilder;
    autocomplete(interaction: AutocompleteInteraction): Promise<void> | undefined;
    execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction): Promise<void>;
}

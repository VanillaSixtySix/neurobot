import { AutocompleteInteraction, ChatInputCommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, SlashCommandBuilder } from 'discord.js';

export interface BotInteraction {
    data: SlashCommandBuilder | ContextMenuCommandBuilder;
    init: () => Promise<void> | undefined;
    autocomplete(interaction: AutocompleteInteraction): Promise<void> | undefined;
    execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction): Promise<void>;
}

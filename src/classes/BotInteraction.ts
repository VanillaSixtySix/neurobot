import { AutocompleteInteraction, ChatInputCommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { BotClient } from './BotClient';

export class BotInteraction {
    constructor(client: BotClient) {}

    static builders: (SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | ContextMenuCommandBuilder)[] = [];

    init?: () => Promise<void>;
    autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
    executeChat?(interaction: ChatInputCommandInteraction): Promise<void>;
    executeContextMenu?(interaction: ContextMenuCommandInteraction): Promise<void>;
}

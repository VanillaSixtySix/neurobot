import { AutocompleteInteraction, ChatInputCommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, Message, PartialMessage, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { BotClient } from './BotClient';

export class BotInteraction {
    constructor(client: BotClient) {}

    static builders?: (SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | ContextMenuCommandBuilder)[] = [];

    init?: () => Promise<void>;
    onAutocomplete?(interaction: AutocompleteInteraction): Promise<void>;
    onChatInteraction?(interaction: ChatInputCommandInteraction): Promise<void>;
    onContextMenuInteraction?(interaction: ContextMenuCommandInteraction): Promise<void>;
}

import { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction, ContextMenuCommandBuilder, ContextMenuCommandInteraction, Message, PartialMessage, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { BotClient } from './BotClient';

export class BotInteraction {
    constructor(client: BotClient) {}

    static builders?: (SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | ContextMenuCommandBuilder)[] = [];
    static customIds?: string[] = [];

    init?: () => Promise<void>;
    onAutocomplete?(interaction: AutocompleteInteraction): Promise<void>;
    onButton?(interaction: ButtonInteraction): Promise<void>;
    onChatInteraction?(interaction: ChatInputCommandInteraction): Promise<void>;
    onContextMenuInteraction?(interaction: ContextMenuCommandInteraction): Promise<void>;
}

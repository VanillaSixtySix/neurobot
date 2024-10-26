import { ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';

export default class Fun implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new SlashCommandBuilder()
            .setName('pet')
            .setDescription('Pets the bot.')
            .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),
    ];

    async onChatInteraction(interaction: ChatInputCommandInteraction) {
        if (interaction.commandName === 'pet') {
            await this.onPet(interaction);
        }
    }

    async onPet(interaction: ChatInputCommandInteraction) {
        await interaction.reply('aww, thank you~ ( ◡‿◡ *)');
    }
}

import { Collection, ContextMenuCommandBuilder, DiscordAPIError, InteractionContextType, Message, MessageContextMenuCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { ApplicationCommandType } from 'discord-api-types/v10';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import { z } from 'zod';

const TLDRFormat = z.object({
    text: z.string(),
});

export default class TLDR implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new ContextMenuCommandBuilder()
            .setName('TLDR Conversation')
            .setType(ApplicationCommandType.Message)
            .setContexts(InteractionContextType.Guild)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    ];

    async onContextMenuInteraction(interaction: MessageContextMenuCommandInteraction) {
        if (interaction.commandName === 'TLDR Conversation') {
            await interaction.deferReply({ ephemeral: true });
            let messages: Collection<string, Message> | undefined;
            try {
                messages = (await interaction.channel?.messages.fetch({ limit: 100, before: interaction.targetMessage.id }))?.reverse();
            } catch (err) {
                if (err instanceof DiscordAPIError && err.code === 50001) {
                    await interaction.followUp({ content: 'Failed to TL;DR; missing access to messages', ephemeral: true });
                    return;
                }
                await interaction.followUp({ content: 'Failed to TL;DR; failed to fetch messages', ephemeral: true });
                return;
            }
            const toTLDR = messages?.map(message => `${message.member?.displayName ?? message.author.displayName}: "${message.content}"`).join('\n') ?? '';
            if (toTLDR === '') {
                console.log('flag 3');
                await interaction.followUp({ content: 'Failed to process messages to TL;DR', ephemeral: true });
                return;
            }
            let response;
            try {
                response = await this.fetchCompletion(toTLDR);
            } catch (err) {
                console.error('Error processing TL;DR:', err);
                await interaction.followUp({ content: 'Failed to process TL;DR on OpenAI\'s side', ephemeral: true });
                return;
            }
            let anyFlagged;
            try {
                anyFlagged = await this.fetchModeration(response);
            } catch (err) {
                console.error('Error processing moderation:', err);
                await interaction.followUp({ content: 'Failed to process TL;DR moderation on OpenAI\'s side', ephemeral: true });
                return;
            }
            if (anyFlagged) {
                await interaction.followUp({ content: 'TL;DR was flagged as unsafe by OpenAI' });
                return;
            }
            await interaction.followUp({ content: response, ephemeral: true });
        }
    }

    async fetchCompletion(input: string): Promise<string> {
        const completion = await this.client.openAI.beta.chat.completions.parse({
            model: 'gpt-4o-2024-08-06',
            messages: [
                { role: 'system', content: 'You are a Discord chat bot whose purpose is to provide a TL;DR of the given conversation. Provide exact details. Give the TL;DR in a single paragraph. Do not add additional commentary, only provide a TL;DR.' },
                { role: 'user', content: input },
            ],
            temperature: 0.4,
            response_format: zodResponseFormat(TLDRFormat, 'tldr'),
        });

        const tldr = completion.choices[0].message.parsed?.text;
        if (tldr == null) {
            throw new Error('TLDR is null');
        }
        return tldr;
    }

    async fetchModeration(input: string): Promise<boolean> {
        const moderation = await this.client.openAI.moderations.create({
            model: 'text-moderation-latest',
            input,
        });
        if (moderation.results.length === 0) {
            throw new Error('Moderation has no results');
        }
        return moderation.results[0].flagged;
    }
}

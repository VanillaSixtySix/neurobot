import {
    ActionRowBuilder,
    Attachment,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    InteractionContextType,
    Message,
    MessageContextMenuCommandInteraction,
    messageLink,
    PermissionFlagsBits,
    SlashCommandBuilder,
    Sticker
} from 'discord.js';
import { ApplicationCommandType } from 'discord-api-types/v10';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import { getServerConfig } from '../utils';
import { parseDiscordUserInput, saveMessageAttachments } from '../utils';
import Reactions from './reactions';

export default class Info implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new ContextMenuCommandBuilder()
            .setName('Log')
            .setType(ApplicationCommandType.Message)
            .setContexts(InteractionContextType.Guild)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        new ContextMenuCommandBuilder()
            .setName('Log and Delete')
            .setType(ApplicationCommandType.Message)
            .setContexts(InteractionContextType.Guild)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        new SlashCommandBuilder()
            .setName('avatar')
            .setDescription('Displays the user\'s global and server avatars')
            .setContexts(InteractionContextType.Guild)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
            .addStringOption(option =>
                option
                    .setName('user')
                    .setDescription('The user\'s username or ID')
                    .setRequired(true)
            ),
    ];
    static customIds = ['showFirstReactions', 'hideFirstReactions'];

    private infoDeleteMessages = {
        success: ' *(deleted)*',
        botMissingPermissions: ' *(failed to delete; bot missing permissions)*',
        unknown: ' *(failed to delete; unknown)*',
    };

    async onContextMenuInteraction(interaction: MessageContextMenuCommandInteraction) {
        if (interaction.commandName.startsWith('Log')) {
            if (!interaction.inGuild()) {
                await interaction.reply({ content: 'Message logging not supported outside of a server', ephemeral: true });
                return;
            }
            const serverConfig = getServerConfig(interaction.guildId);
            if (!serverConfig) {
                await interaction.reply({ content: 'Message logging not set up', ephemeral: true });
                return;
            }
            const interactionConfig = serverConfig.interactions.info;

            const message = interaction.targetMessage;
            const embed = await makeInfoEmbed(message);

            const outChannel = await message.client.channels.fetch(interactionConfig.logChannel);
            if (!outChannel?.isTextBased() || !(outChannel?.isSendable())) {
                console.warn(`Channel ${interactionConfig.logChannel} is not a text channel, or cannot be sent to`);
                await interaction.reply({ content: 'An error occurred executing this interaction - output channel set incorrectly.', ephemeral: true });
                return;
            }

            const actionRow = makeShowFirstReactionsActionRow();

            let targetLogContent = `*Message information requested by ${interaction.user} in ${message.channel}; [Jump to message](${message.url})*`;
            let replyContent = `Message information sent to ${outChannel}; [Jump to original message](${message.url})`;

            if (interaction.commandName === 'Log and Delete') {
                if (message.deletable) {
                    try {
                        await message.delete()
                        targetLogContent += this.infoDeleteMessages.success;
                        replyContent += this.infoDeleteMessages.success;
                    } catch (err) {
                        console.warn(`Failed to delete message at ${messageLink} despite passing checks:`, err);
                        targetLogContent += this.infoDeleteMessages.unknown;
                        replyContent += this.infoDeleteMessages.unknown;
                    }
                } else {
                    targetLogContent += this.infoDeleteMessages.botMissingPermissions;
                    replyContent += this.infoDeleteMessages.botMissingPermissions;
                }
            }

            await outChannel.send({ content: targetLogContent, embeds: [embed], components: [actionRow] });
            await interaction.reply({ content: replyContent, ephemeral: true });
        }
    }

    async onChatInteraction(interaction: ChatInputCommandInteraction) {
        if (interaction.commandName === 'avatar') {
            const userInput = interaction.options.getString('user');
            const user = await parseDiscordUserInput(this.client, userInput!);
            if (user == null) {
                await interaction.reply('Could not find user by username or ID');
                return;
            }
            const member = await interaction.guild?.members.fetch(user);

            const embeds = [];

            const globalAvatarEmbed = new EmbedBuilder()
                .setColor(0xAA8ED6)
                .setTitle('Global Avatar')
                .setImage(user.avatarURL({ size: 4096 }));
            embeds.push(globalAvatarEmbed);

            if (member != null) {
                const serverAvatarEmbed = new EmbedBuilder()
                    .setColor(0xAA8ED6)
                    .setTitle('Server Avatar');
                const avatar = member.avatarURL({ size: 4096 });
                if (avatar != null) {
                    serverAvatarEmbed.setImage(avatar);
                    embeds.push(serverAvatarEmbed);
                }
            }
            const hasServerAvatar = embeds.length > 1 ? '✅' : '❌';
            const content = `✅ Global Avatar; ${hasServerAvatar} Server Avatar`;
            await interaction.reply({ content, embeds });
        }
    }

    async onButton(interaction: ButtonInteraction) {
        if (interaction.customId === 'showFirstReactions') {
            if (!interaction.inGuild()) {
                await interaction.reply({ content: 'First reactions not supported outside of a server', ephemeral: true });
                return;
            }
            if (!interaction.message.editable) {
                await interaction.reply({ content: 'Unable to edit info message', ephemeral: true });
                return;
            }

            const messageEmbeds = interaction.message.embeds;
            const messageIdMatch = messageEmbeds[0].footer?.text.match(/Message ID: (\d+)/);
            if (!messageIdMatch) {
                await interaction.reply({ content: 'Could not find message ID in info embed', ephemeral: true });
                return;
            }
            const messageId = messageIdMatch[1];

            const reactionInteraction = <Reactions>this.client.interactions.get(Reactions.name.toLowerCase());
            const firstReactionsEmbeds = await reactionInteraction.firstReactions(interaction.guildId, messageId);

            const firstDescription = firstReactionsEmbeds[0].data.description;
            firstReactionsEmbeds[0].setDescription(`(Expanded by ${interaction.user})\n\n${firstDescription}`)

            const actionRow = makeHideFirstReactionsActionRow();

            await interaction.message.edit({
                embeds: [
                    ...messageEmbeds,
                    ...firstReactionsEmbeds
                ],
                components: [actionRow]
            });
            await interaction.deferUpdate();
        } else if (interaction.customId === 'hideFirstReactions') {
            if (!interaction.inGuild()) {
                await interaction.reply({ content: 'First reactions not supported outside of a server', ephemeral: true });
                return;
            }
            if (!interaction.message.editable) {
                await interaction.reply({ content: 'Unable to edit info message', ephemeral: true });
                return;
            }
            const messageEmbeds = interaction.message.embeds;

            const actionRow = makeShowFirstReactionsActionRow();

            await interaction.message.edit({
                embeds: [messageEmbeds[0]],
                components: [actionRow]
            });
            await interaction.deferUpdate();
        }
    }
}

export async function makeInfoEmbed(message: Message): Promise<EmbedBuilder> {
    const serverConfig = getServerConfig(message.guildId!)!;
    const interactionConfig = serverConfig.interactions.info;
    const createdTimestamp = Math.floor(message.createdTimestamp / 1000);

    let embed = new EmbedBuilder()
        .setColor(0xAA8ED6)
        .setAuthor({ name: `${message.author.tag} (${message.author.id})`, iconURL: message.author.displayAvatarURL() })
        .setDescription(message.content || '*(No content)*')
        .addFields({ name: 'Timestamp', value: `<t:${createdTimestamp}:d> <t:${createdTimestamp}:T>` })
        .setFooter({ text: 'Message ID: ' + message.id + '\nChannel ID: ' + message.channelId });

    if (message.editedTimestamp != null) {
        const editedTimestamp = Math.floor(message.editedTimestamp / 1000);
        embed.addFields({ name: 'Edited', value: `<t:${editedTimestamp}:d> <t:${editedTimestamp}:T>` });
    }

    if (message.attachments.size > 0) {
        if (interactionConfig.saveAttachments) {
            const savedAttachments = await saveMessageAttachments(serverConfig, message);
            embed.addFields({
                name: 'Attachments',
                value: savedAttachments
                    .map(attachment => `[${attachment.name}](${attachment.url})`)
                    .join('\n')
            });
        } else {
            embed.addFields({
                name: 'Attachments',
                value: message.attachments
                    .map((attachment: Attachment) => `[${attachment.name}](${attachment.url})`)
                    .join('\n')
            })
        }
    }

    if (message.stickers.size > 0) {
        embed.addFields({
            name: 'Stickers',
            value: message.stickers.map((sticker: Sticker) => `[${sticker.name}](${sticker.url})`).join('\n')
        });
    }

    if (message.reference) {
        embed.addFields({
            name: "Reference (reply/forward)",
            value: await formatMessageReference(message)
        });
    }

    return embed;
}

async function formatMessageReference(message: Message): Promise<string> {
    try {
        // We can use messageSnapshot for forwarded messages when Discord releases them.
        const referredMessage = await message.fetchReference();
        const externalServerConfig = referredMessage.guildId ? getServerConfig(referredMessage.guildId) : undefined;

        const referredMessageStr = `<@${referredMessage.author.id}>: ${referredMessage.content}`;
        return `${referredMessageStr}\n\n${(externalServerConfig ? `[Jump to referenced message](${referredMessage.url})` : '*(Message outside of server)*')}`;
    } catch (err: any) {
        if (err.code === "GuildChannelResolve") {
            return '*(Could not fetch referenced message)*';
        }
        console.error('Failed to fetch message reference:', err);
        return 'Something went wrong.';
    }
}

function makeShowFirstReactionsActionRow(): ActionRowBuilder<ButtonBuilder> {
    const showFirstReactions = new ButtonBuilder()
        .setCustomId('showFirstReactions')
        .setLabel('First Reactions')
        .setStyle(ButtonStyle.Primary);

    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(showFirstReactions);
}

function makeHideFirstReactionsActionRow(): ActionRowBuilder<ButtonBuilder> {
    const hideFirstReactions = new ButtonBuilder()
        .setCustomId('hideFirstReactions')
        .setLabel('Hide First Reactions')
        .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(hideFirstReactions);
}

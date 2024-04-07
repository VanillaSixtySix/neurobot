import { ApplicationCommandType, ChatInputCommandInteraction, ContextMenuCommandBuilder, EmbedBuilder, MessageContextMenuCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';
import { parseDiscordUserInput, saveMessageAttachments } from '../utils';

export default class Info implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new ContextMenuCommandBuilder()
            .setName('Log Information')
            .setType(ApplicationCommandType.Message)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        new SlashCommandBuilder()
            .setName('avatar')
            .setDescription('Displays the user\'s global and server avatars')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
            .addStringOption(option =>
                option
                    .setName('user')
                    .setDescription('The user\'s username or ID')
                    .setRequired(true)
            )
    ];

    async onContextMenuInteraction(interaction: MessageContextMenuCommandInteraction) {
        const interactionConfig = config.interactions.info;

        const message = interaction.targetMessage;
        const createdTimestamp = Math.floor(message.createdTimestamp / 1000);

        let embed = new EmbedBuilder()
            .setColor(0xAA8ED6)
            .setAuthor({ name: `${message.author.tag} (${message.author.id})`, iconURL: message.author.displayAvatarURL() })
            .setDescription(message.content || '*(No content)*')
            .addFields({ name: 'Timestamp', value: `<t:${createdTimestamp}:d> <t:${createdTimestamp}:T>` });

        if (message.editedTimestamp != null) {
            const editedTimestamp = message.editedTimestamp != null ? Math.floor(message.editedTimestamp / 1000) : null;
            embed.addFields({ name: 'Edited', value: `<t:${editedTimestamp}:d> <t:${editedTimestamp}:T>` });
        }

        if (message.attachments.size > 0) {
            if (interactionConfig.saveAttachments) {
                const savedAttachments = await saveMessageAttachments(message);
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
                        .map(attachment => `[${attachment.name}](${attachment.url})`)
                        .join('\n')
                })
            }
        }

        const outChannel = await message.client.channels.fetch(interactionConfig.logChannel);
        if (!outChannel?.isTextBased()) {
            console.warn(`Channel ${interactionConfig.logChannel} is not a text channel`);
            await interaction.reply({ content: 'An error occurred executing this interaction - output channel set incorrectly.', ephemeral: true });
            return;
        }

        const content = `*Message information requested by ${interaction.user} in ${message.channel}; [Jump to message](${message.url})*`;
        await outChannel.send({ content, embeds: [embed] });

        await interaction.reply({ content: `Message information sent to ${outChannel}`, ephemeral: true });
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
            interaction.reply({ content, embeds });
        }
    }
}

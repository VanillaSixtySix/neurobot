import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'stream';
import { ApplicationCommandType, ChatInputCommandInteraction, ContextMenuCommandBuilder, EmbedBuilder, GuildMember, MessageContextMenuCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';
import { parseDiscordUserInput } from '../utils';

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
            let attachmentFiles: string[] = [];
            if (config.interactions.info.saveAttachments) {
                const attachmentDir = config.interactions.info.attachmentDir;
                const attachmentBaseURL = config.interactions.info.attachmentBaseURL.replace(/\/$/, '');

                fs.mkdirSync(attachmentDir, { recursive: true });

                for (const attachment of message.attachments.values()) {
                    const originalFilename = new URL(attachment.url).pathname.split('/').pop()!;
                    const newName = `${message.id}-${originalFilename}`;
                    const attachmentPath = path.join(attachmentDir, newName);

                    const attachmentRes = await fetch(attachment.url);

                    const stream = fs.createWriteStream(attachmentPath, { flags: 'w' });
                    Readable.fromWeb(attachmentRes.body!).pipe(stream);

                    const attachmentURL = attachmentBaseURL + '/' + newName;

                    attachmentFiles.push(`[${originalFilename}](${attachmentURL})`);
                }
            }

            if (attachmentFiles.length === 0) {
                attachmentFiles = [...message.attachments.values()].map(attachment => `[${attachment.name}](${attachment.url})`);
            }
            embed.addFields({ name: 'Attachment', value: attachmentFiles.join('\n') });
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
                .setTitle('Global Avatar')
                .setImage(user.avatarURL());
            embeds.push(globalAvatarEmbed);

            if (member != null) {
                const serverAvatarEmbed = new EmbedBuilder()
                    .setTitle('Server Avatar');
                const avatar = member.avatarURL();
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

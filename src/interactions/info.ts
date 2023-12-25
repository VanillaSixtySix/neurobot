import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { ApplicationCommandType, ContextMenuCommandBuilder, EmbedBuilder, MessageContextMenuCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';

export default class Info implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new ContextMenuCommandBuilder()
            .setName('Log Information')
            .setType(ApplicationCommandType.Message)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
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
}

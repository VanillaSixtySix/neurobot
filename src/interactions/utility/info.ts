import { ApplicationCommandType, ContextMenuCommandBuilder, EmbedBuilder, MessageContextMenuCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { BotInteraction } from '../../classes/BotInteraction';
import config from '../../../config.toml';

export default {
    data: new ContextMenuCommandBuilder()
        .setName('Log Information')
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction: MessageContextMenuCommandInteraction) {
        const interactionConfig = config.interactions.utility.info;

        const message = interaction.targetMessage;
        const createdTimestamp = Math.floor(message.createdTimestamp / 1000);

        let embed = new EmbedBuilder()
            .setColor(0xAA8ED6)
            .setAuthor({ name: `${message.author.tag} (${message.author.id})`, iconURL: message.author.displayAvatarURL() })
            .setDescription(message.content)
            .addFields({ name: 'Timestamp', value: `<t:${createdTimestamp}:d> <t:${createdTimestamp}:T>` });
        
        if (message.editedTimestamp != null) {
            const editedTimestamp = message.editedTimestamp != null ? Math.floor(message.editedTimestamp / 1000) : null;
            embed.addFields({ name: 'Edited', value: `<t:${editedTimestamp}:d> <t:${editedTimestamp}:T>` });
        }

        if (message.attachments.size > 0) {
            const attachmentFiles = [...message.attachments.values()].map(attachment => `[${attachment.name}](${attachment.url})`).join('\n');
            embed.addFields({ name: 'Attachment', value: attachmentFiles });
        }

        const outChannel = await message.client.channels.fetch(interactionConfig.logChannel);
        if (!outChannel?.isTextBased()) {
            console.warn(`Channel ${interactionConfig.logChannel} is not a text channel`);
            return;
        }

        const content = `*Message information requested by ${interaction.user} in ${message.channel}; [Jump to message](${message.url})*`;
        await outChannel.send({ content, embeds: [embed] });

        await interaction.reply({ content: `Message information sent to ${outChannel}`, ephemeral: true });
    },
} as BotInteraction;

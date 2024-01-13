import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder, GuildMember, Role } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';

export default class EmbedBan implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new SlashCommandBuilder()
            .setName('embedban')
            .setDescription('Toggles the embed ban role on the user')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
            .addStringOption(option =>
                option
                    .setName('user')
                    .setDescription('The user to toggle the embed ban role on')
                    .setRequired(true)
            ),
    ];

    async onChatInteraction(interaction: ChatInputCommandInteraction) {
        const embedBanRoleId = config.interactions.embedban.role;
        if (!embedBanRoleId) return;

        let role: Role | null | undefined = interaction.guild!.roles.cache.get(embedBanRoleId);
        if (!role) {
            role = await interaction.guild!.roles.fetch(embedBanRoleId);
            if (!role) {
                await interaction.reply(`Pending role ${embedBanRoleId} does not exist. Please contact the bot operator.`);
                console.error(`Pending role ${embedBanRoleId} does not exist`);
                return;
            }
        }

        const userInput = interaction.options.getString('user');
        // match with this regex: (?:<@)?(\d{17,})(?:>)?
        const idMatch = userInput?.match(/(?:<@)?(\d{17,})(?:>)?/);
        let member: GuildMember | undefined = undefined;
        if (idMatch == null) {
            // assume it's a username
            member = interaction.guild!.members.cache.find(member => member.user.username === userInput);
        } else {
            member = await interaction.guild!.members.fetch(idMatch[1]);
        }
        if (member == null) {
            await interaction.reply('Could not find user by username or ID');
            return;
        }
        if (member.roles.cache.has(embedBanRoleId)) {
            await member.roles.remove(role, `[interaction/embedban] User unbanned from using embeds`);
            await interaction.reply(`Removed embed ban role for ${member}.`);
            return;
        } else {
            await member.roles.add(role, `[interaction/embedban] User banned from using embeds`);
            await interaction.reply(`Added embed ban role for ${member}.`);
            return;
        }
    }
}

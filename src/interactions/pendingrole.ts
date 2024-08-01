import { Message, GuildMember, VoiceState, PartialGuildMember, Role, SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import { config, getServerConfig } from '../utils.ts';

export default class PendingRole implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [
        new SlashCommandBuilder()
            .setName('pendingrole')
            .setDescription('Utilities for managing the pending role')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
            .addSubcommand(subCommand =>
                subCommand
                    .setName('add-missing')
                    .setDescription('Adds the pending role to anyone missing it')
            )
    ]

    pendingRoles = new Map<string, Role>();

    async init() {
        for (const serverConfig of config.servers) {
            const guildId = serverConfig.guildId;
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) continue;
            const pendingRoleId = serverConfig.interactions.pendingRole.role;
            if (!pendingRoleId) continue;
            let pendingRole: Role | null = guild.roles.cache.get(pendingRoleId)!;
            if (!pendingRole) {
                pendingRole = await guild.roles.fetch(pendingRoleId);
                if (!pendingRole) {
                    console.error(`Pending role ${pendingRoleId} does not exist`);
                    continue;
                }
            }
            this.pendingRoles.set(guildId, pendingRole);
        }

        this.client.on('messageCreate', message => this.onMessageCreate(message));
        this.client.on('guildMemberUpdate', (oldMember, newMember) => this.onMemberUpdate(oldMember, newMember));
        this.client.on('voiceStateUpdate', (oldState, newState) => this.onVoiceStateUpdate(oldState, newState));
    }

    async onMessageCreate(message: Message) {
        if (!message.inGuild()) return;
        if (!this.pendingRoles.has(message.guildId)) return;
        if (message.author.bot) return;
        await this.givePendingRole(message.member!, 'message');
    }

    async onMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
        if (!this.pendingRoles.has(newMember.guild.id)) return;
        if (newMember.user.bot) return;
        await this.givePendingRole(newMember, 'member update');
    }

    async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        if (!this.pendingRoles.has(newState.guild.id)) return;
        if (newState.member?.user.bot) return;
        await this.givePendingRole(newState.member!, 'voice');
    }

    async givePendingRole(member: GuildMember, type: string = 'generic') {
        if (member == null) {
            console.error(`[interaction/${type}] member is null`);
            return;
        }

        const pendingRoleId = this.pendingRoles.get(member.guild.id)!.id;
        if (member.roles.cache.has(pendingRoleId)) return;
        try {
            await member.roles.add(pendingRoleId, `[interaction/${type}] User no longer pending rule verification`);
        } catch (err) {
            console.error(`Failed to give pending role in "${member.guild.name}" to "${member.user.username}":`, err);
        }
    }

    async onChatInteraction(interaction: ChatInputCommandInteraction) {
        if (!interaction.inGuild()) return;
        const serverConfig = getServerConfig(interaction.guildId);
        if (!serverConfig) return;

        const subCommand = interaction.options.getSubcommand();
        if (subCommand === 'add-missing') {
            const pendingRole = this.pendingRoles.get(interaction.guildId);
            if (!pendingRole) {
                await interaction.reply({ content: 'Pending role not set up', ephemeral: true });
                return;
            }
            const initialResponseStr = `Adding \`${pendingRole.name}\` to members missing it... this may take a while!`;
            await interaction.reply({ content: initialResponseStr });
            let members = await interaction.guild?.members.fetch();
            if (!members) {
                await interaction.reply({ content: 'Failed to fetch members', ephemeral: true });
                return;
            }
            members = members.filter(member => !member.roles.cache.has(pendingRole.id));
            let addedCount = 0;
            const membersArr = members.toJSON();
            let updateInterval = setInterval(async () => {
                const percentDone = Math.floor((addedCount / membersArr.length) * 100);
                try {
                    await interaction.editReply({ content: initialResponseStr + ` [${addedCount}/${membersArr.length}] ${percentDone}%` });
                } catch (err) {
                    console.error('Failed to update PendingRole status:', err);
                    clearInterval(updateInterval);
                }
            }, 15 * 1000);
            for (const member of membersArr) {
                if (member.roles.cache.has(pendingRole.id)) continue;
                await member.roles.add(pendingRole, '[command/pendingrole/add-missing] Manual invocation');
                addedCount++;
            }
            clearInterval(updateInterval);
            await interaction.followUp({ content: `Added \`${pendingRole.name}\` to ${addedCount} members missing it.` });
        }
    }
}

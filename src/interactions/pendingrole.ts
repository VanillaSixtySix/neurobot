import { Message, GuildMember, VoiceState, PartialGuildMember, Role } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import { config } from '../utils.ts';

export default class PendingRole implements BotInteraction {
    constructor(private client: BotClient) {}

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
        await member.roles.add(pendingRoleId, `[interaction/${type}] User no longer pending rule verification`);
    }
}

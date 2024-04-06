import { Message, GuildMember, VoiceState, PartialGuildMember, Role } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';

import { beingReassigned } from './reassignrole.ts';

export default class PendingRole implements BotInteraction {
    constructor(private client: BotClient) {}

    pendingRole: Role | null = null;

    async init() {
        const guild = this.client.guilds.cache.get(config.guildId)!;
        if (!guild) return;
        const pendingRoleId = config.interactions.pendingrole.role;
        if (!pendingRoleId) return;
        this.pendingRole = guild.roles.cache.get(pendingRoleId)!;
        if (!this.pendingRole) {
            this.pendingRole = await guild.roles.fetch(pendingRoleId);
            if (!this.pendingRole) {
                console.error(`Pending role ${pendingRoleId} does not exist`);
                return;
            }
        }

        this.client.on('messageCreate', message => this.onMessageCreate(message));
        this.client.on('guildMemberUpdate', (oldMember, newMember) => this.onMemberUpdate(oldMember, newMember));
        this.client.on('voiceStateUpdate', (oldState, newState) => this.onVoiceStateUpdate(oldState, newState));
    }

    async onMessageCreate(message: Message) {
        if (message.guildId !== config.guildId) return;
        if (message.author.bot) return;
        if (!message.inGuild()) return;
        await this.givePendingRole(message.member!, 'message');
    }

    async onMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
        if (newMember.guild.id !== config.guildId) return;
        if (newMember.user.bot) return;
        if (beingReassigned.includes(newMember.id)) return;
        await this.givePendingRole(newMember, 'member update');
    }

    async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        if (newState.guild.id !== config.guildId) return;
        if (newState.member?.user.bot) return;
        await this.givePendingRole(newState.member!, 'voice');
    }

    async givePendingRole(member: GuildMember, type: string = 'generic') {
        if (member == null) {
            console.error(`[interaction/${type}] member is null`);
            return;
        }

        if (member.roles.cache.has(this.pendingRole!.id)) return;
        await member.roles.add(this.pendingRole!, `[interaction/${type}] User no longer pending rule verification`);
    }
}

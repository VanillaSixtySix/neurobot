import { Message, GuildMember, VoiceState, PartialGuildMember, Role } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';

export default class PendingRole implements BotInteraction {
    constructor(private client: BotClient) {}

    async init() {
        this.client.on('messageCreate', message => this.onMessageCreate(message));
        this.client.on('guildMemberUpdate', (oldMember, newMember) => this.onMemberUpdate(oldMember, newMember));
        this.client.on('voiceStateUpdate', (oldState, newState) => this.onVoiceStateUpdate(oldState, newState));
    }

    async onMessageCreate(message: Message) {
        if (message.author.bot) return;
        if (!message.inGuild()) return;
        await this.givePendingRole(message.member!, 'message');
    }

    async onMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
        if (newMember.user.bot) return;
        await this.givePendingRole(newMember, 'member update');
    }

    async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        if (newState.member?.user.bot) return;
        await this.givePendingRole(newState.member!, 'voice');
    }

    async givePendingRole(member: GuildMember, type: string = 'generic') {
        const pendingRoleId = config.interactions.pendingrole.role;
        if (!pendingRoleId) return;

        let role: Role | null | undefined = member.guild.roles.cache.get(pendingRoleId);
        if (!role) {
            role = await member.guild.roles.fetch(pendingRoleId);
            if (!role) {
                console.error(`Pending role ${pendingRoleId} does not exist`);
                return;
            }
        }

        if (member.roles.cache.has(pendingRoleId)) return;
        await member.roles.add(role, `[interaction/${type}] User no longer pending rule verification`);
    }
}

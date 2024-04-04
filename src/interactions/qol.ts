import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';

export default class QOL implements BotInteraction {
    constructor(private client: BotClient) {}

    static builders = [];

    async init() {
        await this.initMinecraftFix();
    }

    async initMinecraftFix() {
        const qolConfig = config.interactions.qol;
        const guild = this.client.guilds.cache.get(config.guildId)!;
        if (!guild) return;
        const subRole = guild.roles.cache.get(qolConfig.subRole)!;
        if (!subRole) return;
        const minecraftRole = guild.roles.cache.get(qolConfig.minecraftRole)!;
        if (!minecraftRole) return;
        this.client.on('guildMemberUpdate', async (oldMember, newMember) => {
            if (newMember.roles.cache.has(minecraftRole.id) && !newMember.roles.cache.has(subRole.id)) {
                await newMember.roles.remove(minecraftRole, '[qol] User does not have subscriber role');
            }
        });
    }
}

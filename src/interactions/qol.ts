import { AutoModerationActionType, GuildTextBasedChannel } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';

export default class QOL implements BotInteraction {
    constructor(private client: BotClient) {}

    async init() {
        await this.initEssaying();
        await this.initMinecraftFix();
        await this.initAutoModAttachments();
    }

    async initMinecraftFix() {
        const qolConfig = config.interactions.qol.minecraftFix;
        const guild = this.client.guilds.cache.get(config.guildId)!;
        if (!guild) return;
        const subRole = guild.roles.cache.get(qolConfig.subRole)!;
        if (!subRole) return;
        const minecraftRole = guild.roles.cache.get(qolConfig.minecraftRole)!;
        if (!minecraftRole) return;
        this.client.on('guildMemberUpdate', async (oldMember, newMember) => {
            if (newMember.guild.id !== config.guildId) return;
            if (newMember.roles.cache.has(minecraftRole.id) && !newMember.roles.cache.has(subRole.id)) {
                await newMember.roles.remove(minecraftRole, '[qol] User does not have subscriber role');
            }
        });
    }

    async initEssaying() {
        const qolConfig = config.interactions.qol.essaying;
        const emote = qolConfig.emote;
        const threshold = qolConfig.threshold;
        if (emote === '') return;
        if (threshold === 0) return;
        this.client.on('messageCreate', async message => {
            if (message.guildId !== config.guildId)
            if (message.author.bot) return;
            if (message.content.length >= threshold) {
                await message.react(emote);
            }
        });
    }

    async initAutoModAttachments() {
        const qolConfig = config.interactions.qol.autoMod;
        if (!qolConfig.sendFlagAttachments) return;
        this.client.on('autoModerationActionExecution', async execution => {
            if (execution.guild.id !== config.guildId) return;
            if (execution.action.type !== AutoModerationActionType.SendAlertMessage) return;
            if (execution.channel == null) return;
            if (execution.messageId == null) return;
            if (execution.alertSystemMessageId == null) return;
            const message = await execution.channel.messages.fetch(execution.messageId);
            if (message == null) return;
            if (message.attachments.size === 0) return;
            let rule = execution.guild.autoModerationRules.cache.get(execution.ruleId);
            if (rule == null) {
                rule = await execution.guild.autoModerationRules.fetch(execution.ruleId);
                if (rule == null) return;
            }
            const alertChannelId = execution.autoModerationRule?.actions
                .find(action => action.metadata.channelId != null)?.metadata.channelId;
            if (alertChannelId == null) return;
            let alertChannel = execution.guild.channels.cache.get(alertChannelId) as GuildTextBasedChannel | undefined;
            if (alertChannel == null) {
                alertChannel = await execution.guild.channels.fetch(alertChannelId) as GuildTextBasedChannel | undefined;
                if (alertChannel == null) return;
            }
            const alertMessage = await alertChannel.messages.fetch(execution.alertSystemMessageId);
            if (alertMessage == null) return;
            await alertMessage.reply({
                files: message.attachments.map(attachment => ({
                    name: attachment.name,
                    attachment: attachment.url
                }))
            });
        });
    }
}

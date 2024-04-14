import { GuildTextBasedChannel, Message, MessageType } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';
import { makeInfoEmbed } from './info';

export default class QOL implements BotInteraction {
    constructor(private client: BotClient) {}

    messageCache: Message[] = [];

    channelPollRateLimitStarts = new Map<string, number>();
    userPollRateLimitStarts = new Map<string, number>();

    async init() {
        await this.initEssaying();
        await this.initMinecraftFix();
        await this.initAutoModAttachments();
        await this.initVedalReplyMention();
        await this.initPollRestrictions();
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
        const ignoredChannels: string[] = qolConfig.ignoredChannels;

        if (emote === '') return;
        if (threshold === 0) return;

        this.client.on('messageCreate', async message => {
            if (message.guildId !== config.guildId)
            if (message.author.bot || message.webhookId != null) return;
            if (ignoredChannels.includes(message.channelId)) return;
            if (message.content.length >= threshold) {
                await message.react(emote);
            }
        });
    }

    async initAutoModAttachments() {
        const qolConfig = config.interactions.qol.autoMod;
        if (!qolConfig.sendFlagAttachments) return;

        // EXPLANATION: While Discord has an event called "autoModerationActionExecution"
        //  for listening to automod triggers, that requires Manage Server, which isn't
        //  a reasonable permission to grant the bot just for this one QoL feature.
        //
        //  Instead, we're doing a little bit of a workaround. When the original message
        //  is sent, if it triggers an automod flag, that system message has the exact
        //  same timestamp and author details as the original message. Here, we'll use a
        //  rolling cache of 10 messages instead of 2, just in case there's some edge
        //  case with a really active server or slow/out-of-order API. Check for messages
        //  that have the same createdTimestamp + author ID and handle as before like
        //  with the privileged event.

        this.client.on('messageCreate', async message => {
            if (message.guildId !== config.guildId) return;
            if (this.messageCache.length === 10) {
                this.messageCache.shift();
            }
            this.messageCache.push(message);

            const sameTimestampsAndAuthors = this.messageCache.filter(cachedMessage => {
                const first = this.messageCache.find(m =>
                    m.createdTimestamp === cachedMessage.createdTimestamp &&
                    m.author.id === cachedMessage.author.id
                )!;
                const last = this.messageCache.findLast(m =>
                    m.createdTimestamp === cachedMessage.createdTimestamp &&
                    m.author.id === cachedMessage.author.id
                )!;
                return first.id !== last.id;
            });

            // while testing always had this as [] or [ 0, 24 ], it might be different with a high enough activity
            if (sameTimestampsAndAuthors.length !== 2) return;
            const original = sameTimestampsAndAuthors.find(m => m.type === MessageType.Default)!;
            const alertMessage = sameTimestampsAndAuthors.find(m => m.type === MessageType.AutoModerationAction)!;
            if (original == null || alertMessage == null) return;
            this.messageCache.splice(this.messageCache.indexOf(original), 1);
            this.messageCache.splice(this.messageCache.indexOf(alertMessage), 1);

            if (original.attachments.size === 0) return;
            await alertMessage.reply({
                files: original.attachments.map(attachment => ({
                    name: attachment.name,
                    attachment: attachment.url
                }))
            });
        });
    }

    async initVedalReplyMention() {
        const qolConfig = config.interactions.qol.vedalReplyMention;
        const ignoredRoleIds: string[] = qolConfig.ignoredRoles;
        const ignoredChannelIds: string[] = qolConfig.ignoredChannels;

        const guild = this.client.guilds.cache.get(config.guildId)!;
        if (!guild) return;
        const logChannel = guild.channels.cache.get(qolConfig.logChannel) as GuildTextBasedChannel;
        if (!logChannel) return;

        this.client.on('messageCreate', async message => {
            if (message.guildId !== config.guildId) return;
            if (message.author.bot) return;
            if (message.member?.roles.cache.some(role => qolConfig.ignoredRoles.includes(role.id))) return;
            if (ignoredRoleIds.some(roleId => message.member?.roles.cache.has(roleId)))
            if (ignoredChannelIds.includes(message.channelId)) return;

            if (message.mentions.repliedUser == null) return;
            if (!message.mentions.users.has(message.mentions.repliedUser.id)) return;
            if (message.mentions.repliedUser.id !== qolConfig.vedal) return;
            const embed = await makeInfoEmbed(message);
            const repliedMessage = await message.fetchReference();
            const repliedEmbed = await makeInfoEmbed(repliedMessage);
            await logChannel.send({ content: `*Vedal reply mention in ${message.channel}; [Jump to message](${message.url})*`, embeds: [repliedEmbed, embed] });
        });
    }

    async initPollRestrictions() {
        const qolConfig = config.interactions.qol.pollRestrictions;
        const allowedRolesIds: string[] = qolConfig.allowedRoles;
        const disallowedChannelIds: string[] = qolConfig.disallowedChannels;
        const globalMinutesPerChannel: number = qolConfig.globalMinutesPerChannel;
        const globalMinutesPerUser: number = qolConfig.globalMinutesPerUser;

        const guild = this.client.guilds.cache.get(config.guildId);
        if (!guild) return;

        this.client.on('raw', async data => {
            if (data.t === 'MESSAGE_CREATE' && data.d.poll != null && data.d.guild_id === config.guildId) {
                const channel = await this.client.guilds.cache.get(config.guildId)!.channels.fetch(data.d.channel_id) as GuildTextBasedChannel;
                const message = await channel.messages.fetch(data.d.id);
                const messageTimestamp = Math.floor(message.createdTimestamp / 1000);

                if (disallowedChannelIds.includes(data.d.channel_id)) {
                    await message.delete();
                    return;
                }
                if (!message.member?.roles.cache.some(role => allowedRolesIds.includes(role.id))) {
                    await message.delete();
                    return;
                }
                let userRateLimitStart = this.userPollRateLimitStarts.get(message.author.id);
                if (userRateLimitStart != null) {
                    const userRateLimitEnd = userRateLimitStart + globalMinutesPerUser * 60;
                    if (messageTimestamp < userRateLimitEnd) {
                        await message.delete();
                        const newMessage = await channel.send(`Rate limited! ${message.author}, you may post another poll <t:${userRateLimitEnd}:R>.`);
                        setTimeout(() => newMessage.delete(), 8 * 1000);
                        return;
                    }
                }
                let channelRateLimitStart = this.channelPollRateLimitStarts.get(data.d.channel_id);
                if (channelRateLimitStart != null) {
                    const channelRateLimitEnd = channelRateLimitStart + globalMinutesPerChannel * 60;
                    if (messageTimestamp < channelRateLimitEnd) {
                        await message.delete();
                        const newMessage = await channel.send(`Rate limited! ${message.author}, polls will be available in this channel again <t:${channelRateLimitEnd}:R>.`);
                        setTimeout(() => newMessage.delete(), 8 * 1000);
                        return;
                    }
                }

                this.userPollRateLimitStarts.set(message.author.id, messageTimestamp);
                setTimeout(() => {
                    this.userPollRateLimitStarts.delete(message.author.id);
                }, globalMinutesPerUser * 60 * 1000);

                this.channelPollRateLimitStarts.set(data.d.channel_id, messageTimestamp);
                setTimeout(() => {
                    this.channelPollRateLimitStarts.delete(data.d.channel_id);
                }, globalMinutesPerChannel * 60 * 1000);
            }
        });
    }
}

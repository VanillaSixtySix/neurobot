import { GuildTextBasedChannel, Message, MessageType, Role } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import { config, getServerConfig } from '../utils.ts';
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
        const fixRoles = new Map<string, { subRole: Role, minecraftRole: Role }>();

        for (const serverConfig of config.servers) {
            const qolConfig = serverConfig.interactions.qol.minecraftFix;
    
            const guild = this.client.guilds.cache.get(serverConfig.guildId)!;
            if (!guild) continue;
            const subRole = guild.roles.cache.get(qolConfig.subRole)!;
            if (!subRole) continue;
            const minecraftRole = guild.roles.cache.get(qolConfig.minecraftRole)!;
            if (!minecraftRole) continue;

            fixRoles.set(guild.id, {
                subRole,
                minecraftRole
            });
        }

        this.client.on('guildMemberUpdate', async (oldMember, newMember) => {
            if (!fixRoles.has(newMember.guild.id)) return;
            const { subRole, minecraftRole } = fixRoles.get(newMember.guild.id)!;
            if (newMember.roles.cache.has(minecraftRole.id) && !newMember.roles.cache.has(subRole.id)) {
                await newMember.roles.remove(minecraftRole, '[qol] User does not have subscriber role');
            }
        });
    }

    async initEssaying() {
        const qolConfigs = new Map<string, any>();

        for (const serverConfig of config.servers) {
            const qolConfig = serverConfig.interactions.qol.essaying;
    
            if (qolConfig.emote === '') continue;
            if (qolConfig.threshold === 0) continue;

            qolConfigs.set(serverConfig.guildId, qolConfig);
        }

        this.client.on('messageCreate', async message => {
            if (!message.inGuild()) return;
            const qolConfig = qolConfigs.get(message.guildId);
            if (qolConfig == null) return;
            if (message.author.bot || message.webhookId != null) return;
            if (qolConfig.ignoredChannels.includes(message.channelId)) return;
            if (message.content.length >= qolConfig.threshold) {
                await message.react(qolConfig.emote);
            }
        });
    }

    async initAutoModAttachments() {
        const enabledGuildIds: string[] = config.servers.map(serverConfig => {
            if (serverConfig.interactions.qol.autoMod.sendFlagAttachments) {
                return serverConfig.guildId;
            }
            return null;
        }).filter(id => id != null);

        if (enabledGuildIds.length === 0) return;

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
            if (!message.inGuild()) return;
            const serverConfig = getServerConfig(message.guildId);
            if (!serverConfig) return;
            if (!serverConfig.interactions.qol.autoMod.sendFlagAttachments) return;
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
        const logChannels = new Map<string, GuildTextBasedChannel>();

        for (const serverConfig of config.servers) {
            const qolConfig = serverConfig.interactions.qol.vedalReplyMention;
    
            const guild = this.client.guilds.cache.get(serverConfig.guildId)!;
            if (!guild) return;
            const logChannel = guild.channels.cache.get(qolConfig.logChannel) as GuildTextBasedChannel;
            if (!logChannel) return;

            logChannels.set(serverConfig.guildId, logChannel)
        }

        this.client.on('messageCreate', async message => {
            if (!message.inGuild()) return;
            const logChannel = logChannels.get(message.guildId);
            if (!logChannel) return;
            const serverConfig = getServerConfig(message.guildId)!;
            const qolConfig = serverConfig.interactions.qol.vedalReplyMention;
            if (message.author.bot) return;
            if (message.member?.roles.cache.some(role => qolConfig.ignoredRoles.includes(role.id))) return;
            if (qolConfig.ignoredRoles.some(roleId => message.member?.roles.cache.has(roleId)))
            if (qolConfig.ignoredChannels.includes(message.channelId)) return;

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
        this.client.on('messageCreate', async message => {
            if (!message.inGuild()) return;
            if (!message.poll) return;
            const serverConfig = getServerConfig(message.guildId);
            if (!serverConfig) return;
            const qolConfig = serverConfig.interactions.qol.pollRestrictions;
            if (!qolConfig.enabled) return;
            const allowedRolesIds: string[] = qolConfig.allowedRoles;
            const disallowedChannelIds: string[] = qolConfig.disallowedChannels;
            const bypassRoleIds: string[] = qolConfig.bypassRoles;
            const bypassChannelIds: string[] = qolConfig.bypassChannels;
            const globalMinutesPerChannel: number = qolConfig.globalMinutesPerChannel;
            const globalMinutesPerUser: number = qolConfig.globalMinutesPerUser;

            if (message.member!.roles.cache.some(role => bypassRoleIds.includes(role.id))) return;
            if (bypassChannelIds.includes(message.channelId)) return;
            if (disallowedChannelIds.includes(message.channelId)) {
                await message.delete();
                return;
            }
            if (allowedRolesIds.length > 0 && !message.member!.roles.cache.some(role => allowedRolesIds.includes(role.id))) {
                await message.delete();
                return;
            }

            let userRateLimitStart = this.userPollRateLimitStarts.get(message.author.id);
            if (userRateLimitStart != null) {
                const userRateLimitEnd = userRateLimitStart + globalMinutesPerUser * 60 * 1000;
                if (message.createdTimestamp < userRateLimitEnd) {
                    await message.delete();
                    const newMessage = await message.channel.send(`Rate limited! ${message.author}, you may post another poll <t:${Math.ceil(userRateLimitEnd / 1000)}:R>.`);
                    setTimeout(() => newMessage.delete(), 8 * 1000);
                    return;
                }
            }
            let channelRateLimitStart = this.channelPollRateLimitStarts.get(message.channelId);
            if (channelRateLimitStart != null) {
                const channelRateLimitEnd = channelRateLimitStart + globalMinutesPerChannel * 60 * 1000;
                if (message.createdTimestamp < channelRateLimitEnd) {
                    await message.delete();
                    const newMessage = await message.channel.send(`Rate limited! ${message.author}, polls will be available in this channel again <t:${Math.ceil(channelRateLimitEnd / 1000)}:R>.`);
                    setTimeout(() => newMessage.delete(), 8 * 1000);
                    return;
                }
            }

            this.userPollRateLimitStarts.set(message.author.id, message.createdTimestamp);
            setTimeout(() => {
                this.userPollRateLimitStarts.delete(message.author.id);
            }, globalMinutesPerUser * 60 * 1000);

            this.channelPollRateLimitStarts.set(message.channelId, message.createdTimestamp);
            setTimeout(() => {
                this.channelPollRateLimitStarts.delete(message.channelId);
            }, globalMinutesPerChannel * 60 * 1000);
        });
    }
}

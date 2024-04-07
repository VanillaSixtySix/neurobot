import { AutoModerationActionType, GuildTextBasedChannel, Message, MessageType } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';

export default class QOL implements BotInteraction {
    constructor(private client: BotClient) {}

    messageCache: Message[] = [];

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

        // EXPLANATION: While Discord has an event called "autoModerationActionExecution"
        //  for listening to automod triggers, that requires Manage Server, which isn't
        //  a reasonable permission to grant the bot just for this one QoL feature.
        //
        //  Instead, we're doing a little bit of a workaround. When the original message
        //  is sent, if it triggers an automod flag, that system message has the exact
        //  same timestamp and author details as the original message. Here, we'll use a
        //  rolling cache of 10 messages instead of 2, just in case there's some edge
        //  case with a really active server or slow/out-of-order API. Check for messages
        //  that have the same createdTimestamp and author ID, and handle as before like
        //  with the privileged event.

        this.client.on('messageCreate', async message => {
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
}

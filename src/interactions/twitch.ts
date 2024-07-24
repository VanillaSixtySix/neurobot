import { randomUUID } from 'node:crypto';
import { EmbedBuilder, TextBasedChannel } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import { config, getServerConfig } from '../utils.ts';
import { ServerConfig } from '../interfaces/Config.ts';

interface Packet<T> {
    type: string;
    data: T;
}

interface PollCompleteData {
    poll: {
        poll_id: string;
        owned_by: string;
        created_by: string;
        title: string;
        started_at: string;
        ended_at: string;
        ended_by: null;
        duration_seconds: number;
        settings: {
            multi_choice: {
                is_enabled: boolean;
            };
            bits_votes: {
                is_enabled: boolean;
                cost: number;
            };
            channel_points_votes: {
                is_enabled: boolean;
                cost: number;
            };
        };
        status: 'COMPLETED';
        choices: {
            choice_id: string;
            title: string;
            votes: {
                total: number;
                bits: number;
                channel_points: number;
                base: number;
            };
            tokens: {
                bits: number;
                channel_points: number;
            };
            total_voters: number;
        }[];
        votes: {
            total: number;
            bits: number;
            channel_points: number;
            base: number;
        };
        tokens: {
            bits: number;
            channel_points: number;
        };
        total_voters: number;
        remaining_duration_milliseconds: number;
        top_contributor: null;
        top_bits_contributor: null;
        top_channel_points_contributor: null;
    };
}

export default class Twitch implements BotInteraction {
    constructor(private client: BotClient) {}

    sockets = new Map<string, WebSocket>();
    totalCloses = new Map<string, number>();

    async init(guildId?: string) {
        if (guildId == null) {
            for (const serverConfig of config.servers) {
                if (!serverConfig.interactions.twitch.pollResultsChannel) continue;
                this.sockets.set(serverConfig.guildId, new WebSocket('wss://pubsub-edge.twitch.tv/v1'));
                this.sockets.get(serverConfig.guildId)!.addEventListener('open', event => this.onOpen(serverConfig, event as any));
                this.sockets.get(serverConfig.guildId)!.addEventListener('message', event => this.onMessage(serverConfig, event as any));
                this.sockets.get(serverConfig.guildId)!.addEventListener('close', event => this.onClose(serverConfig, event as any));
                this.sockets.get(serverConfig.guildId)!.addEventListener('error', event => this.onError(event as any));
                this.totalCloses.set(serverConfig.guildId, 0);
            }
            return;
        }
        const serverConfig = getServerConfig(guildId);
        if (!serverConfig) return;
        this.sockets.set(serverConfig.guildId, new WebSocket('wss://pubsub-edge.twitch.tv/v1'));
        this.sockets.get(serverConfig.guildId)!.addEventListener('open', event => this.onOpen(serverConfig, event as any));
        this.sockets.get(serverConfig.guildId)!.addEventListener('message', event => this.onMessage(serverConfig, event as any));
        this.sockets.get(serverConfig.guildId)!.addEventListener('close', event => this.onClose(serverConfig, event as any));
        this.sockets.get(serverConfig.guildId)!.addEventListener('error', event => this.onError(event as any));
        this.totalCloses.set(serverConfig.guildId, 0);
    }

    onOpen(serverConfig: ServerConfig, event: Event) {
        this.sockets.get(serverConfig.guildId)!.send(JSON.stringify({
            type: 'LISTEN',
            data: {
                auth_token: serverConfig.interactions.twitch.authKey,
                topics: ['polls.' + serverConfig.interactions.twitch.pollUser],
                nonce: randomUUID(),
            }
        }));
        setInterval(() => {
            this.sockets.get(serverConfig.guildId)!.send(JSON.stringify({
                type: 'PING',
            }));
        }, 1000 * 60 * 4);
    }

    async onMessage(serverConfig: ServerConfig, event: MessageEvent) {
        const stringPacket = JSON.parse(event.data) as Packet<{
            topic: string;
            message: string;
        }>;

        if (stringPacket.type !== 'MESSAGE') return;

        let packet = JSON.parse(stringPacket.data.message) as Packet<any>;

        if (packet.type !== 'POLL_COMPLETE') return;

        const poll = (packet.data as PollCompleteData).poll;

        const pollResultsChannelId = serverConfig.interactions.twitch.pollResultsChannel;
        let pollResultsChannel = this.client.channels.cache.get(pollResultsChannelId) as TextBasedChannel;
        if (!pollResultsChannel) {
            pollResultsChannel = await this.client.channels.fetch(pollResultsChannelId) as TextBasedChannel;
        }
        if (!pollResultsChannel) {
            console.error('Could not find poll results channel', pollResultsChannelId);
            return;
        }

        const duration = Math.ceil(poll.duration_seconds / 60);

        const maxVotes = Math.max(...poll.choices.map(choice => choice.votes.total));

        const embed = new EmbedBuilder()
            .setColor(0xAA8ED6)
            .setDescription(`Duration: ${duration} minute${duration === 1 ? '' : 's'}`)
            .setTitle(poll.title)
            .setTimestamp(new Date(poll.ended_at))
            .addFields(...poll.choices.map(choice => {
                const choiceTotal = choice.votes.total;

                const votesText = `${choiceTotal} vote${choiceTotal === 1 ? '' : 's'}`
                const isWinner = choiceTotal === maxVotes;
                const percentage = (Math.round(choiceTotal / poll.total_voters * 100) || 0) + '%';

                return {
                    name: choice.title,
                    value: `${votesText} — ${percentage} ${isWinner ? '(winner)' : ''}`,
                };
            }))
            .setFooter({ text: 'Total votes: ' + poll.total_voters });

        await pollResultsChannel.send({ embeds: [embed] });
    }

    onClose(serverConfig: ServerConfig, event: CloseEvent) {
        console.info('Twitch WebSocket closed');
        if (event.code !== 1006) {
            console.error(event);
            return;
        }
        const newTotalCloses = this.totalCloses.get(serverConfig.guildId)! + 1;
        this.totalCloses.set(serverConfig.guildId, newTotalCloses);
        if (newTotalCloses > 5) {
            console.error('Twitch WebSocket closed too many times');
            return;
        }
        setTimeout(() => {
            this.init(serverConfig.guildId);
        }, 1000 * 60 * 5);
    }

    onError(event: Event) {
        console.error('Twitch WebSocket error', event);
    }
}

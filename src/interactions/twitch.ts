import { randomUUID } from 'node:crypto';
import { EmbedBuilder, TextBasedChannel } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import config from '../../config.toml';

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

    ws!: WebSocket;

    totalCloses = 0;

    async init() {
        this.ws = new WebSocket('wss://pubsub-edge.twitch.tv/v1');
        this.ws.addEventListener('open', event => this.onOpen(event));
        this.ws.addEventListener('message', event => this.onMessage(event));
        this.ws.addEventListener('close', event => this.onClose(event));
        this.ws.addEventListener('error', event => this.onError(event));
        this.totalCloses = 0;
    }

    onOpen(event: Event) {
        this.ws.send(JSON.stringify({
            type: 'LISTEN',
            data: {
                auth_token: config.interactions.twitch.authKey,
                topics: ['polls.' + config.interactions.twitch.pollUser],
                nonce: randomUUID(),
            }
        }));
        setInterval(() => {
            this.ws.send(JSON.stringify({
                type: 'PING',
            }));
        }, 1000 * 60 * 4);
    }

    async onMessage(event: MessageEvent) {
        const stringPacket = JSON.parse(event.data) as Packet<{
            topic: string;
            message: string;
        }>;

        if (stringPacket.type !== 'MESSAGE') return;

        let packet = JSON.parse(stringPacket.data.message) as Packet<any>;

        if (packet.type !== 'POLL_COMPLETE') return;

        const poll = (packet.data as PollCompleteData).poll;

        const pollResultsChannelId = config.interactions.twitch.pollResultsChannel;
        let pollResultsChannel = this.client.channels.cache.get(pollResultsChannelId) as TextBasedChannel;
        if (!pollResultsChannel) {
            pollResultsChannel = await this.client.channels.fetch(pollResultsChannelId) as TextBasedChannel;
        }
        if (!pollResultsChannel) {
            console.error('Could not find poll results channel', pollResultsChannelId);
            return;
        }

        const duration = Math.ceil(poll.duration_seconds / 60);

        const embed = new EmbedBuilder()
            .setColor(0xAA8ED6)
            .setDescription(`Duration: ${duration} minute${duration === 1 ? '' : 's'}`)
            .setTitle(poll.title)
            .setTimestamp(new Date(poll.ended_at))
            .addFields(...poll.choices.map(choice => {
                const choiceTotal = choice.votes.total;

                const votesText = `${choiceTotal} vote${choiceTotal === 1 ? '' : 's'}`
                const isWinner = choiceTotal > (poll.votes.total / poll.choices.length);
                const percentage = (Math.round(choiceTotal / poll.total_voters * 100) || 0) + '%';

                return {
                    name: choice.title,
                    value: `${votesText} — ${percentage} ${isWinner ? '(winner)' : ''}`,
                };
            }))
            .setFooter({ text: 'Total votes: ' + poll.total_voters });

        await pollResultsChannel.send({ embeds: [embed] });
    }

    onClose(event: CloseEvent) {
        console.info('Twitch WebSocket closed');
        if (event.code !== 1006) {
            console.error(event);
            return;
        }
        this.totalCloses++;
        if (this.totalCloses > 5) {
            console.error('Twitch WebSocket closed too many times');
            return;
        }
        setTimeout(() => {
            this.init();
        }, 1000 * 60 * 5);
    }

    onError(event: Event) {
        console.error('Twitch WebSocket error', event);
    }
}

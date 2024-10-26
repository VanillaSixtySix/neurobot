import { Events, Message } from 'discord.js';
import { BotInteraction } from '../classes/BotInteraction';
import { BotClient } from '../classes/BotClient';
import { getServerConfig } from '../utils.ts';

interface GuildState {
    count: number;
    lastSticker: { name: string; id: string; } | null;
}

interface DBSwarm {
    guild_id: string;
    count: number;
    last_sticker_name: string;
    last_sticker_id: string;
}

export default class Swarm implements BotInteraction {
    constructor(private client: BotClient) {}

    async init() {
        this.client.db.exec(`
            CREATE TABLE IF NOT EXISTS swarm (
                guild_id TEXT NOT NULL PRIMARY KEY,
                count INT NOT NULL,
                last_sticker_name TEXT NOT NULL,
                last_sticker_id TEXT NOT NULL
            )
        `);
        this.client.on(Events.MessageCreate, message => this.onMessageCreate(message));
    }

    guildStates: Map<string, GuildState> = new Map();

    async onMessageCreate(message: Message) {
        if (!message.inGuild()) return;
        if (message.author.bot) return;
        const serverConfig = getServerConfig(message.guildId);
        if (!serverConfig) return;
        if (message.channelId !== serverConfig.interactions.swarm.targetChannel) return;
        if (message.stickers.size === 0) return;
        const sticker = message.stickers.first()!;

        let guildState = this.guildStates.get(message.guildId);
        if (!guildState) {
            const queryStmt = this.client.db.query('SELECT * FROM swarm WHERE guild_id = ?');
            const queryRes = queryStmt.get(message.guildId) as DBSwarm;
            if (queryRes == null) {
                guildState = { count: 0, lastSticker: null };
            } else {
                guildState = {
                    count: queryRes.count,
                    lastSticker: {
                        name: queryRes.last_sticker_name,
                        id: queryRes.last_sticker_id
                    }
                };
            }
        }
        if (guildState.lastSticker == null) {
            guildState.count = 1;
            guildState.lastSticker = { name: sticker.name, id: sticker.id };
        } else if (guildState.lastSticker.id === sticker.id) {
            guildState.count++;
            if (guildState.count % 5 === 0) {
                await message.channel.send(`${sticker.name} has a streak of ${guildState.count}!`);
            }
        } else {
            if (guildState.count >= 5) {
                await message.channel.send(`${message.author} broke ${guildState.lastSticker.name} streak of ${guildState.count}!`);
            }
            guildState.count = 1;
            guildState.lastSticker = {
                name: sticker.name,
                id: sticker.id,
            };
        }
        this.guildStates.set(message.guildId, guildState);
        const sql = `INSERT INTO swarm (guild_id, count, last_sticker_name, last_sticker_id) VALUES ($1, $2, $3, $4)
                     ON CONFLICT (guild_id) DO UPDATE SET count = excluded.count, last_sticker_name = excluded.last_sticker_name, last_sticker_id = excluded.last_sticker_id`;
        const updateStmt = this.client.db.query(sql);
        updateStmt.run(message.guildId, guildState.count, guildState.lastSticker.name, guildState.lastSticker.id);
    }
}

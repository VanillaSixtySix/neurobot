import path from 'node:path';
import Database from 'bun:sqlite';
import { Client, ClientOptions, Collection } from 'discord.js';
import { BotInteraction } from './BotInteraction';
import { listFiles } from '../utils';

export class BotClient extends Client {
    interactions: Collection<string, BotInteraction>;
    db: Database;

    constructor(options: ClientOptions, db: Database) {
        super(options);

        this.db = db;
        this.interactions = new Collection();
    }

    async loadInteractions() {
        const interactionPaths = listFiles(path.join(import.meta.dir, '../interactions'), true);

        for (const file of interactionPaths) {
            const interaction = (await import(file)).default as BotInteraction;

            // if interaction is not a BotInteraction, warn and skip
            if (!('data' in interaction) || !('execute' in interaction)) {
                console.warn(`Interaction file ${file} is not a BotInteraction`);
                continue;
            }

            if (typeof interaction.init === 'function') {
                await interaction.init(this);
            }

            this.interactions.set(interaction.data.name, interaction);
        }
    }

    destroy() {
        this.db.close();
        return super.destroy();
    }
}

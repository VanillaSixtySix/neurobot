import path from 'node:path';
import Database from 'bun:sqlite';
import { Client, ClientOptions, Collection } from 'discord.js';
import { BotInteraction } from './BotInteraction';
import { listFiles } from '../utils';

export class BotClient extends Client {
    interactions: Collection<string, BotInteraction>;

    constructor(options: ClientOptions) {
        super(options);

        this.interactions = new Collection();
    }

    async loadInteractions(db: Database) {
        const interactionPaths = listFiles(path.join(import.meta.dir, '../interactions'), true);

        for (const file of interactionPaths) {
            const interaction = (await import(file)).default;

            // if interaction is not a BotInteraction, warn and skip
            if (!('data' in interaction) || !('execute' in interaction)) {
                console.warn(`Interaction file ${file} is not a BotInteraction`);
                continue;
            }

            this.interactions.set(interaction.data.name, interaction);
        }
    }
}

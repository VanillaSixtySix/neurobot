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
            const InteractionClass = (await import(file)).default as typeof BotInteraction;

            let interaction: BotInteraction;
            try {
                interaction = new InteractionClass(this);
            } catch (err) {
                console.warn(`File ${file} is not a BotInteraction`);
                continue;
            }

            interaction.init?.();

            for (const builder of InteractionClass.builders) {
                this.interactions.set(builder.name, interaction);
            }
        }
    }

    destroy() {
        this.db.close();
        return super.destroy();
    }
}

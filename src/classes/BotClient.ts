import path from 'node:path';
import Database from 'bun:sqlite';
import { Client, ClientOptions, Collection } from 'discord.js';
import OpenAI from 'openai';
import { BotInteraction } from './BotInteraction';
import { listFiles } from '../utils';

export class BotClient extends Client {
    interactions: Collection<string, BotInteraction>;
    db: Database;
    openAI: OpenAI;

    constructor(options: ClientOptions, db: Database, openAI: OpenAI) {
        super(options);

        this.db = db;
        this.openAI = openAI;
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

            console.debug(`Loaded interaction ${InteractionClass.name}`);

            for (const builder of InteractionClass.builders ?? [{ name: InteractionClass.name + '-nobuilders' }]) {
                this.interactions.set(builder.name, interaction);
            }
            for (const customId of InteractionClass.customIds ?? []) {
                this.interactions.set(customId, interaction);
            }
        }
    }

    destroy() {
        this.db.close();
        return super.destroy();
    }
}

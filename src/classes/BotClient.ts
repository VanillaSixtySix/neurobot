import path from 'node:path';
import { Client, ClientOptions, Collection } from 'discord.js';
import { BotCommand } from './BotCommand';
import { listFiles } from '../utils';

export class BotClient extends Client {
    commands: Collection<string, BotCommand>;

    constructor(options: ClientOptions) {
        super(options);

        this.commands = new Collection();
    }

    async loadCommands() {
        const commandPaths = listFiles(path.join(import.meta.dir, '../commands'), true);

        for (const file of commandPaths) {
            const command = (await import(file)).default;

            // if command is not a BotCommand, warn and skip
            if (!('data' in command) || !('execute' in command)) {
                console.warn(`Command file ${file} is not a BotCommand`);
                continue;
            }

            this.commands.set(command.data.name, command);
        }
    }
}

import { REST, Routes } from 'discord.js';
import config from './config.toml';
import path from 'node:path';
import { listFiles } from './src/utils';

const rest = new REST({ version: '10' }).setToken(config.token);

try {
    console.log('Started refreshing application (/) commands.');

    const commandPaths = listFiles(path.join(import.meta.dir, 'src/commands'), true);
    
    const commands = [];

    for (const file of commandPaths) {
        const command = (await import(file)).default;

        // if command is not a BotCommand, warn and skip
        if (!('data' in command) || !('execute' in command)) {
            console.warn(`Command file ${file} is not a BotCommand`);
            continue;
        }

        commands.push(command.data.toJSON());
    }

    if (Bun.argv.includes('--clear')) {
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: [] },
        )
        console.log('Successfully cleared application (/) commands.');
    }

    await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
} catch (error) {
    console.error(error);
}

import { REST, Routes } from 'discord.js';
import config from './config.toml';
import path from 'node:path';
import { listFiles } from './src/utils';

const rest = new REST({ version: '10' }).setToken(config.token);

try {
    console.info('Refreshing application interactions...');

    const interactionPaths = listFiles(path.join(import.meta.dir, 'src/interactions'), true);
    
    const interactions = [];

    for (const file of interactionPaths) {
        const interaction = (await import(file)).default;

        // if interaction is not a BotInteraction, warn and skip
        if (!('data' in interaction) || !('execute' in interaction)) {
            console.warn(`Interaction file ${file} is not a BotInteraction`);
            continue;
        }

        interactions.push(interaction.data.toJSON());
    }

    if (Bun.argv.includes('--clear')) {
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: [] },
        )
        console.info('Cleared existing application interactions');
    }

    await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: interactions },
    );

    console.info('Finished refreshing application interactions');
} catch (error) {
    console.error(error);
}

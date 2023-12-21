import { BaseInteraction, Events, GatewayIntentBits } from 'discord.js';

import { BotClient } from './src/classes/BotClient';
import config from './config.toml';

const client = new BotClient({
    intents: [
        GatewayIntentBits.Guilds,
    ],
});

client.once(Events.ClientReady, async () => {
    console.log('Ready!');

    await client.loadCommands();
});

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
    if (!interaction.isCommand() && !interaction.isAutocomplete()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
        console.error(`Command ${interaction.commandName} not found`);
        return;
    }

    if (interaction.isChatInputCommand()) {
        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(err);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'An error occurred executing this command.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'An error occurred executing this command.', ephemeral: true });
            }
        }
    } else if (interaction.isAutocomplete()) {
        if (!('autocomplete' in command)) {
            console.error(`Command ${interaction.commandName} does not support autocomplete`);
            return;
        }
        try {
            await command.autocomplete(interaction);
        } catch (err) {
            console.error(err);
        }
    }
});

client.login(config.token);

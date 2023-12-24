import { Database } from 'bun:sqlite';
import { BaseInteraction, Events, GatewayIntentBits } from 'discord.js';

import { BotClient } from './classes/BotClient';
import config from '../config.toml';

const db = new Database("neurobot.db");

const client = new BotClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
    allowedMentions: {
        parse: [],
        repliedUser: true,
    },
}, db);

client.once(Events.ClientReady, async () => {
    console.log('Ready!');

    await client.loadInteractions();
});

client.on(Events.InteractionCreate, async (interaction: BaseInteraction) => {
    if (!interaction.isCommand() && !interaction.isAutocomplete() && !interaction.isMessageContextMenuCommand()) return;

    const botInteraction = client.interactions.get(interaction.commandName);
    if (!botInteraction) {
        console.error(`Interaction ${interaction.commandName} not found`);
        return;
    }

    if (interaction.isChatInputCommand()) {
        try {
            await botInteraction.executeChat?.(interaction);
        } catch (err) {
            console.error(err);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'An error occurred executing this command.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'An error occurred executing this command.', ephemeral: true });
            }
        }
    } else if (interaction.isAutocomplete()) {
        if (!('autocomplete' in botInteraction)) {
            console.error(`Command ${interaction.commandName} does not support autocomplete`);
            return;
        }
        try {
            await botInteraction.autocomplete?.(interaction);
        } catch (err) {
            console.error(err);
        }
    } else if (interaction.isMessageContextMenuCommand()) {
        try {
            await botInteraction.executeContextMenu?.(interaction);
        } catch (err) {
            console.error(err);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'An error occurred executing this interaction.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'An error occurred executing this interaction.', ephemeral: true });
            }
        }
    }
});

client.login(config.token);

process.on('SIGINT', async () => {
    console.info('\nGoodbye');
    await client.destroy();
    process.exit(0);
});

import { EmbedBuilder, EmbedData, Events, Message, TextChannel } from 'discord.js';
import { BotInteraction } from '../../classes/BotInteraction';
import { BotClient } from '../../classes/BotClient';
import config from '../../../config.toml';
import { RawPacket } from '../../utils';

interface RawPacketMessageUpdateData {
    id: string;
    channel_id: string;
    guild_id: string;
    edited_timestamp: string;
    content: string;
    author: {
        bot?: boolean;
    }
}

interface DBTranslation {
    message_id: string;
    translated_message_id: string;
}

export default class JP implements BotInteraction {
    constructor(private client: BotClient) {}

    async init() {
        this.client.db.exec(`
            CREATE TABLE IF NOT EXISTS jp_translations (
                message_id TEXT NOT NULL,
                translated_message_id TEXT,
                PRIMARY KEY (message_id)
            )
        `);

        this.client.on(Events.MessageCreate, message => this.onMessageCreate(message));

        // This is done because discord.js' MessageUpdate isn't fired if the message isn't cached
        this.client.on('raw', async (packet: RawPacket<RawPacketMessageUpdateData>) => {
            if (packet.t !== 'MESSAGE_UPDATE') return;
            if (packet.d.author.bot) return;
            if (!packet.d.guild_id) return;
            if (packet.d.channel_id !== config.interactions.jp.targetChannel) return;

            let targetChannel = this.client.channels.cache.get(config.interactions.jp.translationTargetChannel) as TextChannel;
            if (!targetChannel) {
                targetChannel = await this.client.channels.fetch(config.interactions.jp.translationTargetChannel) as TextChannel;
            }

            const toTranslate = packet.d.content;
            if (toTranslate.length === 0) return;

            const translation = await this.translate(toTranslate);

            const selectStmt = this.client.db.query('SELECT translated_message_id FROM jp_translations WHERE message_id = ?');
            const translatedMessageId = selectStmt.get(packet.d.id) as DBTranslation | undefined;

            if (!translatedMessageId) return;

            const translationMessage = await targetChannel.messages.fetch(translatedMessageId.translated_message_id);
            if (!translationMessage) return;

            const embedData = translationMessage.embeds[0] as EmbedData;

            const messageURL = `https://discord.com/channels/${packet.d.guild_id}/${packet.d.channel_id}/${packet.d.id}`;
            const editedTimestamp = new Date(packet.d.edited_timestamp).getTime();

            let editCount = 0;
            if (embedData.footer) {
                editCount = parseInt(embedData.footer.text.split(' ')[1].replace('x', ''));
            }
            let embed = new EmbedBuilder()
                .setColor(0xAA8ED6)
                .setAuthor(embedData.author!)
                .setDescription(`via DeepL | [Jump to message](${messageURL})`)
                .setFields([
                    { name: ' ', value: packet.d.content },
                    { name: 'Translation', value: translation },
                ])
                .setFooter({ text: `Edited ${editCount + 1}x` })
                .setTimestamp(editedTimestamp);

            await translationMessage.edit({ embeds: [embed] });
        });
    }

    async onMessageCreate(message: Message) {
        if (message.author.bot) return;
        if (!message.guild) return;
        if (message.channelId !== config.interactions.jp.targetChannel) return;

        let targetChannel = this.client.channels.cache.get(config.interactions.jp.translationTargetChannel) as TextChannel;
        if (!targetChannel) {
            targetChannel = await this.client.channels.fetch(config.interactions.jp.translationTargetChannel) as TextChannel;
        }

        const toTranslate = message.content;
        // Don't translate if the message is empty (file upload?)
        if (toTranslate.length === 0) return;
        // Don't translate if the message is only emojis
        if (/^(<a?:\w+:\d+> *)+$/.test(toTranslate)) return;

        const translation = await this.translate(toTranslate);

        const embed = new EmbedBuilder()
            .setColor(0xAA8ED6)
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setDescription(`via DeepL | [Jump to message](${message.url})`)
            .addFields([
                { name: ' ', value: message.content },
                { name: 'Translation', value: translation },
            ])
            .setTimestamp(message.createdTimestamp);

        const translationMessage = await targetChannel.send({ embeds: [embed] });

        const insertStmt = this.client.db.query('INSERT INTO jp_translations VALUES (?, ?)');
        insertStmt.run(message.id, translationMessage.id);
    }

    /**
     * Translates the given input from Japanese to English using DeepL.
     * @param input The input to translate.
     * @returns The translated text.
     */
    async translate(input: string): Promise<string> {
        const body = JSON.stringify({
            source_lang: 'JA',
            target_lang: 'EN-US',
            text: [input],
        });

        const translationRes = await fetch('https://api-free.deepl.com/v2/translate', {
            body,
            method: 'POST',
            headers: {
                Authorization: 'DeepL-Auth-Key ' + config.interactions.jp.deeplAPIKey,
                'Content-Type': 'application/json',
                'Content-Length': body.length.toString(),
            }
        });
        if (!translationRes.ok) {
            const body = await translationRes.text();
            console.error('DeepL returned status code', translationRes.status, 'with body', body);
            throw new Error('DeepL returned status code ' + translationRes.status);
        }

        const translation = (await translationRes.json() as any).translations[0].text;
        return translation;
    }
}

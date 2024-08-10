import { Client, Message, User } from 'discord.js';
import fs from 'fs';
import path from 'path';

import { file, TOML } from 'bun';
import { Config, ServerConfig } from './interfaces/Config';

export async function getConfig(): Promise<Config> {
    const rawConfig = await file(import.meta.dir + '/../config.toml').text();
    return TOML.parse(rawConfig) as Config;
}
const config = await getConfig();
export { config };

export function getServerConfig(guildId: string): ServerConfig | undefined {
    return config.servers.find(serverConfig => serverConfig.guildId === guildId);
}

export interface RawPacket<T> {
    t: string;
    d: T;
}

/**
 * Lists all files in the given directory
 * @param dir The directory to list files from
 * @param includeExactPath Whether to include the exact path of the file or not
 * @param fileList The list of files to append to
 * @returns The list of files
 */
export function listFiles(dir: string, includeExactPath = false, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        let filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            listFiles(filePath, includeExactPath, fileList);
        } else {
            filePath = filePath
                .replaceAll('\\', '/');
            if (!includeExactPath) {
                filePath = filePath
                    .replace(`${import.meta.dir}/`, '');
            }
            fileList.push(filePath);
        }
    });

    return fileList;
}

/**
 * Parses the given Discord message URL or ID and returns the message ID
 * @param input The Discord message URL or ID
 */
export function parseMessageInput(input: string) {
    // https://discord.com/channels/933772482127749160/933772482127749163/1188544063260074064
    // 1188544063260074064
    input = input.trim();
    if (!input.startsWith('https')) {
        return input;
    }
    const url = new URL(input);
    const path = url.pathname;
    const split = path.split('/');
    return split[split.length - 1];
}

/**
 * Parses the given Discord emoji string
 * @param input The Discord emoji string
 * @returns The emoji name, ID, and whether it's animated
 */
export function parseEmojiString(input: string): { name: string; id: string; animated: boolean; } {
    const match = input.match(/<(?<animated>a)?:(?<name>\w+):(?<id>\d+)>/)!;
    const { name, id, animated } = match.groups!;
    return { name, id, animated: !!animated };
}

/**
 * Parses the given Discord username or ID as a User
 * @param client The Discord client to search with
 * @param input The Discord username or ID
 * @returns The found user
 */
export async function parseDiscordUserInput(client: Client, input: string) {
    input = input.trim();
    // match with this regex: (?:<@)?(\d{17,})(?:>)?
    const idMatch = input?.match(/(?:<@)?(\d{17,})>?/);
    let user: User | undefined;
    if (idMatch == null) {
        // assume it's a username
        user = client.users.cache.find(cachedUser => cachedUser.username === input);
    } else {
        user = await client.users.fetch(idMatch[1]);
    }
    return user;
}

export interface MessageAttachment {
    name: string;
    url: string;
}

/**
 * Locally saves attachments for the given message
 * @param serverConfig The server config to configure attachment saving with
 * @param message The message to save the attachments of
 * @returns A list of objects with the attachment file name and URL
 */
export async function saveMessageAttachments(serverConfig: ServerConfig, message: Message): Promise<MessageAttachment[]> {
    let attachmentFiles: MessageAttachment[] = [];

    const attachmentDir = serverConfig.attachments.outDir;
    const attachmentBaseURL = serverConfig.attachments.baseURL.replace(/\/$/, '');

    fs.mkdirSync(attachmentDir, { recursive: true });

    for (const attachment of message.attachments.values()) {
        const originalFilename = new URL(attachment.url).pathname.split('/').pop()!;
        const newName = `${message.id}-${originalFilename}`;
        const attachmentPath = path.join(attachmentDir, newName);

        await fetch(attachment.url)
            .then(res => res.arrayBuffer())
            .then(buffer => fs.writeFileSync(attachmentPath, Buffer.from(buffer)))
            .catch(err => {
                throw new Error(`Failed to save attachment: ${err}`);
            });

        const attachmentURL = attachmentBaseURL + '/' + newName;

        attachmentFiles.push({
            name: originalFilename,
            url: attachmentURL
        });
    }

    if (attachmentFiles.length === 0) {
        attachmentFiles = [...message.attachments.values()].map(attachment => ({
            name: attachment.name,
            url: attachment.url
        }));
    }

    return attachmentFiles;
}

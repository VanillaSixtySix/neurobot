import fs from 'fs';
import path from 'path';
import { BotCommand } from './classes/BotCommand';

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

export async function getCommands(dir: string): Promise<BotCommand[]> {
    const files = listFiles(dir);

    const commandPaths = files.map(file => path.join(import.meta.dir, file));

    const commands: BotCommand[] = [];

    for (const file of commandPaths) {
        const command = (await import(file)).default;

        // if command is not a BotCommand, warn and skip
        if (!('data' in command) || !('execute' in command)) {
            console.warn(`Command file ${file} is not a BotCommand`);
            continue;
        }

        commands.push(command.data.toJSON());
    }

    return commands;
}

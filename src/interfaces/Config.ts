export interface Config {
    token: string;
    clientId: string;

    servers: ServerConfig[];
}

export interface ServerConfig {
    guildId: string;

    attachments: {
        save: boolean;
        outDir: string;
        baseURL: string;
    }

    interactions: {
        embedBan: {
            role: string;
        }
        info: {
            logChannel: string;
            saveAttachments: boolean;
        }
        jp: {
            targetChannel: string;
            translationTargetChannel: string;
            deeplAPIKey: string;
        }
        pendingRole: {
            role: string;
        }
        qol: {
            autoMod: {
                sendFlagAttachments: boolean;
            }
            essaying: {
                emote: string;
                threshold: number;
                ignoredChannels: string[];
            }
            minecraftFix: {
                subRole: string;
                minecraftRole: string;
            }
            pollRestrictions: {
                enabled: boolean;
                globalMinutesPerChannel: number;
                globalMinutesPerUser: number;
                allowedRoles: string[];
                disallowedChannels: string[];
                bypassRoles: string[];
                bypassChannels: string[];
            }
            vedalReplyMention: {
                vedal: string;
                logChannel: string;
                ignoredRoles: string[];
                ignoredChannels: string[];
            }
        }
        reactions: {
            bans: {
                enabled: boolean;
                name: string;
                match: string;
                channels: string[];
                ignoredChannels: string[];
            }[];
        }
        swarm: {
            targetChannel: string;
        }
        twitch: {
            authKey: string;
            pollUser: string;
            pollResultsChannel: string;
        }
    }
}

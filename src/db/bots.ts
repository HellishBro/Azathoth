import { database } from "./db.js"

export enum BotType {
    STANDARD, USERBOT
}

export interface Bot {
    id: string,
    owner: string,
    prefix: string,
    type: BotType
}

export interface BotLBStats {
    id: string,
    last_updated: number,
    guilds: number,
    guilds_regex: string
}

export interface BotCommands {
    help_command: string | null,
    ping_command: string | null,
    prefix_command: string | null,
    stats_command: string | null
}

export function fetch_bot(id: string): Bot | undefined {
    return (
        database
            .prepare<{id: string}, Bot>("SELECT id, owner, prefix, type FROM bots WHERE id = @id")
            .get({id})
    );
}

export function upsert_bot(bot: Bot) {
    database
        .prepare<Bot, unknown>(`
            INSERT INTO bots (id, owner, prefix, type) VALUES (@id, @owner, @prefix, @type)
            ON CONFLICT (id) DO UPDATE SET owner = @owner, prefix = @prefix, type = @type WHERE id = @id
        `)
        .run(bot);
}

export function fetch_leaderboard(id: string): BotLBStats | undefined {
    return (
        database
            .prepare<{id: string}, BotLBStats>(`
                SELECT id, last_updated, guilds, guilds_regex FROM leaderboard_stats WHERE id = @id
            `)
            .get({id})
    );
}

export function upsert_leaderboard(lb: BotLBStats) {
    database
        .prepare<BotLBStats, unknown>(`
            INSERT INTO leaderboard_stats (id, last_updated, guilds, guilds_regex)
                VALUES (@id, @last_updated, @guilds, @guilds_regex)
                ON CONFLICT (id) DO UPDATE SET
                    last_updated = @last_updated, guilds = @guilds, guilds_regex = @guilds_regex
                WHERE id = @id
        `)
        .run(lb);
}

export function fetch_bot_commands(id: string): BotCommands | undefined {
    return (
        database
            .prepare<{id: string}, BotCommands>(`
                SELECT id, help_command, ping_command, prefix_command, stats_command FROM bot_commands WHERE id = @id
            `)
            .get({id})
    );
}

export function upsert_bot_commands(commands: BotCommands) {
    database
        .prepare<BotCommands, unknown>(`
            INSERT INTO bot_commands (id, help_command, ping_command, prefix_command, stats_command)
                VALUES (@id, @help_command, @ping_command, @prefix_command, @stats_command)
                ON CONFLICT (id) DO UPDATE SET
                    help_command = @help_command, ping_command = @ping_command,
                    prefix_command = @prefix_command, stats_command = @stats_command
                WHERE id = @id
        `)
        .run(commands);
}
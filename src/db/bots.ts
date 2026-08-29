import { database } from "./db.js"

export enum BotType {
    STANDARD = 0, USERBOT = 1
}

export interface Bot {
    id: string,
    owner: string,
    prefix: string,
    type: BotType,
    registered: boolean
}

interface BotDB {
    id: string,
    owner: string,
    prefix: string,
    type: number,
    registered: number
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
    let dat = (
        database
            .prepare<{id: string}, BotDB>(
                "SELECT id, owner, prefix, type, registered FROM bots WHERE id = @id"
            )
            .get({id})
    );
    if (dat == undefined) return;
    return {...dat, registered: dat.registered == 1};
}

export function upsert_bot(bot: Bot) {
    database
        .prepare<BotDB, unknown>(`
            INSERT INTO bots (id, owner, prefix, type, registered)
            VALUES (@id, @owner, @prefix, @type, @registered)
            ON CONFLICT (id) DO UPDATE SET
            owner = @owner, prefix = @prefix, type = @type, registered = @registered
            WHERE id = @id
        `)
        .run({
            ...bot,
            registered: bot.registered ? 1 : 0
        });
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
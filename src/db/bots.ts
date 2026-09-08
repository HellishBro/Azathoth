import { database } from "./db.js"

export enum BotType {
    STANDARD = 0, USERBOT = 1
}

export interface Bot {
    id: string,
    owner: string,
    prefix: string,
    type: BotType,
    registered: boolean,
    support_community: string | null
}

interface BotDB {
    id: string,
    owner: string,
    prefix: string,
    type: number,
    registered: number,
    support_community: string | null
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
                "SELECT id, owner, prefix, type, registered, support_community FROM bots WHERE id = @id"
            )
            .get({id})
    );
    if (dat == undefined) return;
    return {...dat, registered: dat.registered == 1};
}


export function get_total_bots(): number {
    return (
        database.prepare<{}, number>("SELECT COUNT(*) FROM bots").get({})
    ) ?? 0;
}

export const PER_PAGE = 10;


export function get_all_bots(sort: "insert" | "id" | "guilds", asc: boolean, page: number): Bot[] {
    let asc_str = asc ? "ASC" : "DESC";

    let select = "SELECT id, owner, prefix, type, registered, support_community FROM bots";
    if (sort == "id") {
        select = `${select} ORDER BY id ${asc_str}`;
    }
    if (sort == "guilds") {
        select = `
            ${select}
            LEFT JOIN leaderboard_stats lb_stats ON lb_stats.id = bots.id
            ORDER BY COALESCE(lb_stats.guilds, 0) ${asc_str}
        `;
    }
    if (sort == "insert") {
        select = `${select} ORDER BY ROWID ${asc_str}`;
    }
    select = `${select} LIMIT ${PER_PAGE} OFFSET ${page * PER_PAGE}`;
    let dat = database.prepare<{}, BotDB>(select).all({});
    return dat.map(i => ({...i, registered: i.registered == 1}));
}

export function upsert_bot(bot: Bot) {
    database
        .prepare<BotDB, unknown>(`
            INSERT INTO bots (id, owner, prefix, type, registered, support_community)
            VALUES (@id, @owner, @prefix, @type, @registered, @support_community)
            ON CONFLICT (id) DO UPDATE SET
                owner = @owner, prefix = @prefix, type = @type, registered = @registered, support_community = @support_community
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
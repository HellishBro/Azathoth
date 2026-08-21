import Database, { Database as DB } from "better-sqlite3";
import { environ } from "./env.js";
import { readdir, readFile } from "node:fs/promises";

export let database: DB;


export async function init() {
    database = new Database(environ.DATABASE);
    database.pragma("foreign_key = ON");
    database.pragma("journal_mode = WAL");

    await migrate();
}

export function close() {
    database.close();
}


async function migrate() {
    let migration_directory = "src/migrations/";
    let files = await readdir(migration_directory);
    let migrated: string[] = [];
    try {
        migrated = database.prepare<[], string>(
            "SELECT used FROM migrations"
        ).pluck().all();
    } catch (e) {}
    for (let file of files) {
        if (file.endsWith(".sql") && !migrated.includes(file)) {
            let content = await readFile(migration_directory + file, "utf-8");
            database.transaction(() => {
                database.exec(content);
                database.prepare<string>(
                    "INSERT INTO migrations (used) VALUES (?)"
                ).run(file);
            });
        }
    }
}


export function upsert_scripted_message(
    id: string,
    text: string
) {
    database.transaction(() => {
        database.prepare<{
            id: string,
            text: string
        }>(
            "INSERT INTO scripted_messages (id, text) VALUES (@id, @text) ON CONFLICT(id) REPLACE"
        ).run({id, text});
    });
}


export function get_scripted_message(
    id: string
): string | undefined {
    return database.prepare<{id: string}, string>(
        "SELECT text FROM scripted_messages WHERE id = @id"
    ).pluck().get({id});
}


export function change_scripted_message_id(
    id: string,
    channel_id: string,
    message_id: string
) {
    database.transaction(() => {
        database.prepare<{
            id: string,
            channel_id: string,
            message_id: string
        }>(
            "UPDATE scripted_messages SET channel_id = @channel_id, message_id = @message_id WHERE id = @id"
        ).run({id, channel_id, message_id});
    })
}


export function get_scripted_message_id(
    id: string
): {
    message_id: string,
    channel_id: string
} | undefined {
    return database.prepare<{id: string}, {
        message_id: string,
        channel_id: string
    }>(
        "SELECT message_id, channel_id FROM scripted_messages WHERE id = @id"
    ).get({id});
}
import Database, { Database as DB } from "better-sqlite3";
import { environ } from "../env.js";
import { readdir, readFile } from "node:fs/promises";

export let database: DB;


export async function database_init() {
    database = new Database(environ.DATABASE);
    database.pragma("foreign_key = ON");
    database.pragma("journal_mode = WAL");

    await migrate();
}

export function database_close() {
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
    } catch (e) {
        console.log(e);
    }
    files.sort((a, b) => parseInt(a.slice(0, 3)) - parseInt(b.slice(0, 3)));
    for (let file of files) {
        if (file.endsWith(".sql") && !migrated.includes(file)) {
            let content = await readFile(migration_directory + file, "utf-8");
            database.exec(content);
            database.prepare<string>(
                "INSERT INTO migrations (used) VALUES (?)"
            ).run(file);
            console.log(`Migrating to ${file}`);
        }
    }
}

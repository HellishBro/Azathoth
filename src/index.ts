process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);


import { environ, load_env } from './env.js';
import { database_close, database_init } from './db/db.js';

load_env();
await database_init();

import { Client, Events, Guild } from '@fluxerjs/core';
import { parse_command } from './commands.js';

import load_scripts from "./load_scripts.js";
import { register_events } from './event.js';
import cleanup from "node-cleanup";
import { register_reply_chain_listener } from './features/reply_chain.js';


cleanup(() => {
  database_close();
});


load_scripts();

let client = new Client();

client.on(Events.Ready, () => {
  console.log('Ready');
});

client.on(Events.GuildCreate, async (guild: Guild) => {
    if (guild.id != environ.GUILD_ID) {
        await client.user!.leaveGuild(guild.id);
    }
});

client.on(Events.MessageCreate, async (message) => {
  parse_command(client, message);
});

register_events(client);
register_reply_chain_listener(client);

await client.login(environ.TOKEN);
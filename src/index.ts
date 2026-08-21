import { parse_command } from './commands.js';
import { environ, load_env } from './env.js';

load_env();

import { Client, Events, Guild } from '@fluxerjs/core';

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

await client.login(environ.TOKEN);
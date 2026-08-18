import { environ, load_env } from './env.js';
import { load_runtime_json } from './runtime.json.js';

load_env();
load_runtime_json();

import { Client, Events, Guild } from '@fluxerjs/core';

let client = new Client();

client.on(Events.Ready, () => {
  console.log('Ready');
});

client.on(Events.GuildCreate, async (guild: Guild) => {
    if (guild.id != environ.GUILD_ID) {
        await client.user!.leaveGuild(guild.id);
    }
})

client.on(Events.MessageCreate, async (message) => {
  if (message.content === '!ping') {
    await message.reply('Pong');
  }
});

await client.login(environ.TOKEN);
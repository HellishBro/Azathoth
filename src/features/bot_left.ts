import { Client, Routes } from "@fluxerjs/core";
import { Bot, delete_bot, get_bot_channel } from "../db/bots.js";
import { environ } from "../env.js";

export async function bot_left(client: Client, bot: Bot) {
    await client.channels.send(environ.LOG_CHANNEL_ID, `The bot <@${bot.id}> left. Cleaning up.`);
    let channel = get_bot_channel(bot.id);
    if (channel) {
        await client.rest.delete(Routes.channel(channel));
    }
    delete_bot(bot)
}
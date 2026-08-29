import { Client, Message } from "@fluxerjs/core";
import { parse_scripts_command } from "./features/scripts.js";
import { ErrorType, is_admin, send_error, split_space } from "./util.js";
import { parse_ticket_command } from "./features/ticket.js";
import { parse_bot_db_command } from "./features/bots.js";

export async function parse_command(
    client: Client,
    message: Message
) {
    let self_mention = `<@${client.user!.id}>`;
    if (!message.content.startsWith(self_mention)) return;
    let stripped = message.content.slice(self_mention.length).trim();
    let [command, rest] = split_space(stripped);
    if (command == "scripts") {
        if (!await is_admin(client, message.author.id)) return await send_error(message, ErrorType.UNAUTHORIZED);
        await parse_scripts_command(client, message, rest);
    }
    if (command == "ticket") {
        await parse_ticket_command(client, message, rest);
    }
    if (command == "bot") {
        await parse_bot_db_command(client, message, rest);
    }
}
import { Client, Message } from "@fluxerjs/core";
import { environ } from "./env.js";
import { parse_scripts_command } from "./features/scripts.js";
import { split_space } from "./util.js";

export async function parse_command(
    client: Client,
    message: Message
) {
    let guild = await message.resolveGuild();
    if (!guild) return;
    let member = await guild.fetchMember(message.author.id)!;
    if (!member.roles.has(environ.ADMIN_ROLE_ID)) return;
    let self_mention = `<@${client.user!.id}>`;
    if (!message.content.startsWith(self_mention)) return;
    let stripped = message.content.slice(self_mention.length).trim();
    let [command, rest] = split_space(stripped);
    if (command == "scripts") {
        parse_scripts_command(client, message, rest);
    }
}
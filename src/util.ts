import { Client, Message } from "@fluxerjs/core";
import { environ } from "./env.js";

export function split_space(s: string): [string, string] {
    return s.split(/\s+((.|\n)*)/).map(s => s.trim()) as [string, string];
}

export async function is_admin(client: Client, user: string): Promise<boolean> {
    let guild = await client.guilds.fetch(environ.GUILD_ID);
    if (!guild) return false;
    let member = await guild.fetchMember(user)!;
    if (!member.roles.has(environ.ADMIN_ROLE_ID)) return false;
    return true;
}

export enum ErrorType {
    TICKETS_ONLY = "This command can only be used in a ticket channel.",
    UNAUTHORIZED = "You are not authorized to use this command.",
    SAME_STATE = "This command won't change anything now.",
    REPLY_CHAIN_INVALID = "Input is invalid. Please try again.",
    NOT_FOUND = "Cannot find the specified resource."
}

export async function send_error(message: Message, type: ErrorType | string): Promise<Message> {
    return await message.reply(`Error: ${type}`);
}
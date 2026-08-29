import { Client, EmbedBuilder, Message, PermissionFlags, PermissionsBitField, resolvePermissionsToBitfield } from "@fluxerjs/core";
import { send_error, split_space } from "../util.js";
import { init_reply_chain, register_reply_chain, validate_id } from "./reply_chain.js";
import { database } from "../db/db.js";
import { Bot, BotType, fetch_bot, upsert_bot } from "../db/bots.js";

const GLOBAL_BAD_PERMISSIONS: bigint[] = [
    PermissionFlags.Administrator,
    PermissionFlags.BanMembers,
    PermissionFlags.KickMembers,
    PermissionFlags.ManageGuild,
    PermissionFlags.MentionEveryone,
    PermissionFlags.ManageNicknames,
    PermissionFlags.ManageExpressions,
] as const;

const CHANNEL_OK_PERMISSIONS: bigint[] = [
    PermissionFlags.ManageChannels,
    PermissionFlags.ManageRoles,
    PermissionFlags.MuteMembers,
    PermissionFlags.PrioritySpeaker,
    PermissionFlags.ManageWebhooks,
    PermissionFlags.CreateInstantInvite,
    PermissionFlags.ViewAuditLog,
    PermissionFlags.ModerateMembers,
    PermissionFlags.ViewChannelMembers
] as const;

function make_bot_app_embed(bot: Bot, standard_bot?: {
    provisional_permissions: PermissionsBitField,
    invite_link: string   
}): EmbedBuilder {
    let embed = new EmbedBuilder();
    embed = embed.setTitle("Bot Application");
    embed = embed.setDescription(`Bot created by: <@${bot.owner}>`);
    embed = embed.addFields(
        {
            name: "ID",
            value: bot.id,
            inline: true,
        },
        {
            name: "Prefix",
            value: bot.prefix,
            inline: true,
        },
        {
            name: "Type",
            value: BotType[bot.type],
            inline: true,
        }
    );
    if (standard_bot) {
        embed = embed.addFields(
            {
                name: "Permissions",
                value: standard_bot.provisional_permissions.toArray().join(', '),
                inline: false
            },
            {
                name: "Invite Link",
                value: standard_bot.invite_link,
                inline: false
            }
        );
    }
    return embed;
}

async function finalize_bot_app(client: Client, bot: Bot, ticket_channel: string, standard_bot?: {
    provisional_permissions: PermissionsBitField,
    invite_link: string   
}) {
    let embed = make_bot_app_embed(bot, standard_bot);
    let message = await client.channels.send(ticket_channel, {
        content: `Admins can use @${client.user?.username} \`ticket accept\` to accept this bot invite application.`,
        embeds: [embed]
    });
    await message.pin();
}

register_reply_chain("standard_bot_invite", {
    questions: [
        {
            ident: "invite",
            question: "Paste in your bot's invite link.",
            validate: async (message, {id}) => {
                return URL.canParse(message) ? (() => {
                    let url = new URL(message);
                    if (!url.pathname.includes("oauth2/authorize")) return;
                    let search = url.searchParams;
                    if (!search.has("client_id")) return;
                    if (search.get("client_id") != id) return;
                    if (!search.has("scope")) return;
                    if (!search.get("scope")?.includes("bot")) return;
                    if (!search.has("permissions")) return;
                    return message;
                })() : undefined
            }
        }
    ],
    callback: async (client, {
        type,
        id,
        prefix,
        invite
    }, stage, last_message) => {
        let url = new URL(invite);
        let search = url.searchParams;
        let permissions = search.get("permissions") as string;
        let global_invite = new PermissionsBitField(permissions);
        for (let permission of GLOBAL_BAD_PERMISSIONS) {
            if (global_invite.has(permission)) {
                await last_message.reply(
                    "Warning: Bots cannot have some privileged permissions in this guild. " +
                    "The offending permissions will be turned off once the bot is invited."
                );
                break;
            }
        }
        global_invite = global_invite.remove(GLOBAL_BAD_PERMISSIONS);
        let channel_ok = global_invite.remove(GLOBAL_BAD_PERMISSIONS);
        global_invite = global_invite.remove(CHANNEL_OK_PERMISSIONS);

        database
            .prepare<{channel_id: string, permissions: string}, unknown>(
                "UPDATE bot_invite_tickets SET provisional_permissions = @permissions WHERE channel_id = @channel_id"
            )
            .run({channel_id: stage.channel_id, permissions: channel_ok.toString()});

        search.set("permissions", global_invite.toString());
        
        await finalize_bot_app(client, fetch_bot(id)!, stage.channel_id, {
            provisional_permissions: channel_ok,
            invite_link: url.toString()
        });
    }
});

register_reply_chain("bot_invite_app", {
    questions: [
        {
            ident: "type",
            question: "Is your bot a `standard` bot or a `user` bot?",
            validate: async (message, data, raw) => {
                data.bot_type_message = raw.id;
                if (["standard", "user"].includes(message.toLowerCase())) {
                    return message.toLowerCase();
                }
            }
        },
        {
            ident: "id",
            question: "What is your bot's ID?",
            validate: validate_id()
        },
        {
            ident: "prefix",
            question: "What is your bot's prefix? If it's mention, type `@mention`.",
            validate: async (content) => content
        }
    ],
    callback: async (client, {
        type,
        id,
        prefix,
        bot_type_message
    }, {initiator, channel_id, data}) => {
        upsert_bot({
            id,
            owner: initiator,
            prefix,
            type: type == "standard" ? BotType.STANDARD : BotType.USERBOT,
            registered: false
        });
        database
            .prepare<{channel_id: string, id: string}, unknown>(
                "INSERT INTO bot_invite_tickets (channel_id, bot_attached) VALUES (@channel_id, @id)"
            )
            .run({channel_id, id});
        if (type == "standard") {
            await init_reply_chain(
                await client.channels.fetchMessage(channel_id, bot_type_message),
                "standard_bot_invite",
                initiator,
                data
            );
        } else {
            await finalize_bot_app(client, fetch_bot(id)!, channel_id);
        }
    }
});

export default () => {
    
}

export async function bot_invite_app(client: Client, starter_message: Message, initiator: string, channel_id: string) {
    await init_reply_chain(starter_message, "bot_invite_app", initiator);
}

export async function parse_bot_db_command(client: Client, message: Message, content: string) {
    let [subcommand, rest] = split_space(content);
}
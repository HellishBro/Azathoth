import { ChannelType, Client, EmbedBuilder, Events, GuildMember, Message, OverwriteType, PermissionFlags, PermissionsBitField, resolvePermissionsToBitfield } from "@fluxerjs/core";
import { init_reply_chain, register_reply_chain, validate_id } from "./reply_chain.js";
import { database } from "../db/db.js";
import { Bot, BotType, fetch_bot, get_all_bots, get_total_bots, PER_PAGE, set_bot_channel, upsert_bot } from "../db/bots.js";
import { Command, CommandGroup, PermissionLevel, register_command } from "../commands.js";
import { paged_response } from "./paged_response.js";
import { check_ticket_channel, finalize_ticket_channel, TicketChannelType } from "./ticket.js";
import { ErrorType, send_error } from "../util.js";
import { with_client } from "../event.js";
import { environ } from "../env.js";
import { bot_left } from "./bot_left.js";

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
        content: `Admins can use \`@${client.user?.username} bot ticket accept\` to accept this bot invite application.`,
        embeds: [embed]
    });
    await message.pin();
}

function clean_permissions(p: PermissionsBitField): PermissionsBitField {
    return p.remove(GLOBAL_BAD_PERMISSIONS).remove(CHANNEL_OK_PERMISSIONS);
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
        let bad_permissions: string[] = [];
        for (let permission of GLOBAL_BAD_PERMISSIONS) {
            if (global_invite.has(permission)) {
                bad_permissions.push(new PermissionsBitField(permission).toArray()[0]);
            }
        }
        if (bad_permissions.length) {
            await last_message.reply(
                "Warning: Bots cannot have some privileged permissions in this guild. " +
                "The offending permissions will be turned off once the bot is invited: " +
                bad_permissions.join(", ")
            );
        }
        let channel_ok = global_invite.remove(GLOBAL_BAD_PERMISSIONS);

        database
            .prepare<{channel_id: string, permissions: string}, unknown>(
                "UPDATE bot_invite_tickets SET provisional_permissions = @permissions WHERE channel_id = @channel_id"
            )
            .run({channel_id: stage.channel_id, permissions: channel_ok.toString()});

        search.set("permissions", global_invite.toString());
        
        await finalize_bot_app(client, fetch_bot(id)!, stage.channel_id, {
            provisional_permissions: channel_ok,
            invite_link: get_invite(id, channel_ok)
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
        },
        {
            ident: "support_community",
            question: "What's your bot's support community, if any? If none, type `none`.",
            validate: async (content) => {
                if (content.toLowerCase() == "none") return "none";
                return URL.canParse(content) ? content : undefined;
            }
        }
    ],
    callback: async (client, {
        type,
        id,
        prefix,
        bot_type_message,
        support_community
    }, {initiator, channel_id, data}) => {
        if (prefix == "@mention") {
            prefix = `<@${id}>`;
        }

        upsert_bot({
            id,
            owner: initiator,
            prefix,
            type: type == "standard" ? BotType.STANDARD : BotType.USERBOT,
            registered: false,
            support_community: support_community == "none" ? null : support_community
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

interface BotInviteTicket {
    channel_id: string,
    bot_attached: string,
    provisional_permissions: string
}

function get_bot_invite(channel_id: string): BotInviteTicket {
    return (
        database
            .prepare<{channel_id: string}, BotInviteTicket>(
                "SELECT * FROM bot_invite_tickets WHERE channel_id = @channel_id"
            )
            .get({channel_id})
    )!;
}

export default () => {
    register_command(new CommandGroup(
        "bot",
        "View the list of bots currently in this community.",
        PermissionLevel.REGULAR,
        [
            new Command(
                "list",
                "List the bots in this community.",
                PermissionLevel.REGULAR,
                [
                    {
                        name: "sort",
                        description: "Sort the bots list. Possible values are: " +
                            "`insert` (default), `guilds`, `id`",
                        type: {
                            options: [
                                "insert",
                                "guilds",
                                "id"
                            ]
                        },
                        optional: true
                    },
                    {
                        name: "direction",
                        description: "The direction to sort in. Possible values are: " +
                            "`asc` (default), `desc`",
                        type: {
                            options: [
                                "asc",
                                "desc"
                            ]
                        },
                        optional: true
                    }
                ],
                ({sort: raw_sort, direction}) => async (client, message) => {
                    let sort = (raw_sort ?? "insert") as "insert" | "guilds" | "id";
                    await paged_response(message, () => Math.ceil(get_total_bots() / PER_PAGE), async page => {
                        let bots = get_all_bots(sort, direction == "asc", page);
                        let embed = (
                            new EmbedBuilder()
                                .setTitle(`Bot list (${page + 1}/${Math.ceil(get_total_bots() / PER_PAGE)})`)
                                .setDescription(`Sorting by ${
                                    sort == "insert" ? "insertion order" :
                                    sort == "guilds" ? "guild count" :
                                    "user id"
                                }, ${
                                    direction == "asc" ? "ascending" : "descending"
                                }\nTotal bot count: ${get_total_bots()}`)
                        );
                        let index = page * PER_PAGE;
                        for (let bot of bots) {
                            let bot_user = await client.users.fetch(bot.id);
                            embed = embed.addFields({
                                name: `${index + 1}. ${
                                    bot_user.globalName ?? bot_user.username
                                }`,
                                value: `${
                                    bot.type == BotType.STANDARD ? "Standard" : "User"
                                } Bot\nUser: <@${
                                    bot.id
                                }>\nPrefix: \`${
                                    bot.prefix == `<@${bot.id}>` ? "@mention" : bot.prefix
                                }\`\nOwner: <@${
                                    bot.owner
                                }>\nSupport: ${
                                    bot.support_community ?? "*N/A*"
                                }`
                            });
                            index++;
                        }
                        return {
                            embeds: [embed]
                        };
                    })
                }
            ),
            new CommandGroup(
                "ticket",
                "Actions on bot application tickets.",
                PermissionLevel.ADMIN,
                [
                    new Command(
                        "accept",
                        "Automatically accepts the application and invites the bot.",
                        PermissionLevel.ADMIN,
                        [],
                        () => async (client, message) => {
                            let ticket = await check_ticket_channel(client, message);
                            if (!ticket) return;
                            if (ticket.finalized) return void await send_error(message, ErrorType.SAME_STATE);
                            if (ticket.type != TicketChannelType.BOT_INVITE) return void await send_error(message, ErrorType.BOT_TICKET);

                            await invite_bot(
                                client,
                                message.author.id,
                                get_bot_invite(message.channelId)
                            );
                        }
                    ),
                    new Command(
                        "editperms",
                        "Edits the permissions of the bot application.",
                        PermissionLevel.ADMIN,
                        [
                            {
                                name: "perms",
                                description: "A comma-separated list of permission names.",
                                type: "greedystr"
                            }
                        ],
                        ({perms}) => async (client, message) => {
                            let ticket = await check_ticket_channel(client, message);
                            if (!ticket) return;
                            if (ticket.finalized) return void await send_error(message, ErrorType.SAME_STATE);
                            if (ticket.type != TicketChannelType.BOT_INVITE) return void await send_error(message, ErrorType.BOT_TICKET);

                            let divided = perms.split(/, ?/);
                            let resolved = new PermissionsBitField(resolvePermissionsToBitfield(divided));

                            database
                                .prepare<{channel_id: string, permissions: string}, unknown>(
                                    "UPDATE bot_invite_tickets SET provisional_permissions = @permissions WHERE channel_id = @channel_id"
                                )
                                .run({channel_id: message.channelId, permissions: resolved.toString()});
                            
                            let bot = fetch_bot(get_bot_invite(message.channelId).bot_attached)!;
                            await finalize_bot_app(client, bot, message.channelId, {
                                provisional_permissions: resolved,
                                invite_link: get_invite(bot.id, resolved)
                            });
                        }
                    )
                ]
            )
        ]
    )),
    with_client("Listening for new members", client => {
        client.on(Events.GuildMemberAdd, async (member) => {
            if (!(member.id in invite_bot_queue)) return;
            let data = invite_bot_queue[member.id];
            let bot = fetch_bot(data.bot_attached)!;

            let guild = await client.guilds.fetch(environ.GUILD_ID);

            let display_prefix = bot.prefix == `<@${bot.id}>` ? "@mention" : bot.prefix;

            let suff = ` (${display_prefix})`;
            let display_name = member.user.globalName ?? member.user.username;
            display_name = display_name.substring(0, Math.min(display_name.length, 32 - suff.length));
            let nick = display_name + suff;

            await member.edit({
                nick
            });

            await member.roles.add(environ.BOT_ROLE_ID);

            let channel = await guild.createChannel({
                type: ChannelType.GuildText,
                name: member.user.username,
                parent_id: environ.BOT_TESTS_CATEGORY,
                topic: `For the <@${bot.id}> bot developed by <@${bot.owner}>. Prefix is ${bot.prefix}`
            });

            set_bot_channel(member.id, channel.id);

            await channel.editPermission(bot.id, {
                type: OverwriteType.Member,
                allow: data.provisional_permissions
            });

            let message = await client.channels.send(
                data.channel_id,
                {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Bot Invited!")
                            .setDescription(`<@${bot.owner}>, your bot <@${bot.id}> has been invited with a dedicated test channel <#${channel.id}>.`)
                    ]
                }
            );

            await finalize_ticket_channel(client, message, data.channel_id);

            delete invite_bot_queue[member.id];
        });
    }),
    with_client("Listening for leaving members", client => {
        client.on(Events.GuildMemberRemove, async (member) => {
            let bot = fetch_bot(member.id);
            if (!bot) return;
            await bot_left(client, bot);
        });
    })
}


function get_invite(bot_id: string, permissions: PermissionsBitField): string {
    return `https://web.fluxer.app/oauth2/authorize?client_id=${bot_id}&scope=bot&permissions=${clean_permissions(permissions)}`
}


let invite_bot_queue: Record<string, BotInviteTicket> = {};


async function invite_bot(client: Client, initiator: string, ticket: BotInviteTicket) {
    // TODO: use SURROGATE_HUMAN_FLUXER_USER_TOKEN to automatically invite bot. but meanwhile
    await client.channels.send(
        ticket.channel_id,
        `Please manually click the invite link for now and invite the bot.\n${
            get_invite(ticket.bot_attached, new PermissionsBitField(ticket.provisional_permissions))
        }`
    );
    await client.channels.send(environ.LOG_CHANNEL_ID, `<@${initiator}> is inviting the bot <@${ticket.bot_attached}> with permissions ${new PermissionsBitField(ticket.provisional_permissions).toArray().join(", ")}`);
    invite_bot_queue[ticket.bot_attached] = ticket;
}
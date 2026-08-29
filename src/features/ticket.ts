import { environ } from "./../env.js";
import { get_scripted_message_id, register_script } from "./scripts.js";
import { parse_text, run_script } from "./scripted_messages.js";
import { with_client } from "../event.js";
import { ChannelType, Client, Events, Message, OverwriteType, PermissionFlags, resolvePermissionsToBitfield, Routes, User } from "@fluxerjs/core";
import { database } from "../db/db.js";
import { ErrorType, is_admin, send_error, split_space } from "../util.js";
import { bot_invite_app } from "./bots.js";

enum TicketChannelType {
    ADMINISTRATIVE, BOT_INVITE
}

let DISPLAY: {[key in TicketChannelType]: string};
let PREAMBLE: {[key in TicketChannelType]: string};

let contact_message_id: {
    message_id: string,
    channel_id: string
} | undefined = undefined;

export default () => {
    DISPLAY = {
        [TicketChannelType.ADMINISTRATIVE]: "Administrative Inquiry",
        [TicketChannelType.BOT_INVITE]: "Bot Invite Application"
    };

    PREAMBLE = {
        [TicketChannelType.ADMINISTRATIVE]: `
    **Administrative inquiry**: Tell the administrators what you need help with or need intervention with. Any rule breakers, concerns, etc comes here.`,
        [TicketChannelType.BOT_INVITE]: `
    **Bot invite application**: Please describe your bot and what it does. Whether it is a bot application or user bot; its prefix; some noteworthy commands; etc.

    Please make sure your bot adheres to the rules listed in <#${environ.RULES_CHANNEL}>.

    Staff members will then test your bot.`
    }

    register_script(
        "make_contact",
        "Make contact message",
        "Make the \"Contact Administration\" message in CONTACT_CHANNEL_ID",
        `===
Contact Administrator
===
Create a ticket to have a focused interaction with the administrators regarding private or personal issues. Bot invite applications also go here.

**Note**: This is not a place for support with individual bots.

You can only have a maximum of ${environ.MAX_TICKETS_PER_USER} opened tickets at the same time.

React with 🛠️ to contact administration.
React with 🤖 to create a bot invite application.`,
        async (client) => {
            let message = await run_script(client, "make_contact", environ.CONTACT_CHANNEL_ID);
            contact_message_id = undefined;
            if (message) {
                await message.react("🛠️");
                await message.react("🤖");
            }
        }
    );

    with_client("Listening to contact message reaction", client => {
        client.on(Events.MessageReactionAdd, async ({
            reaction,
            emoji,
            user,
            messageId: message_id,
            channelId: channel_id
        }) => {
            if (user.bot) return;
            if (contact_message_id == undefined) {
                contact_message_id = get_scripted_message_id("make_contact");
            }
            if (!contact_message_id) return;
            if (!(message_id == contact_message_id.message_id && channel_id == contact_message_id.channel_id)) return;
            if (emoji.name == "🛠️") {
                await create_ticket_channel(client, user, TicketChannelType.ADMINISTRATIVE);
            } else if (emoji.name == "🤖") {
                await create_ticket_channel(client, user, TicketChannelType.BOT_INVITE);
            }
            (await reaction.fetchMessage()).removeReaction(emoji, user.id);
        });
    });
}


export async function parse_ticket_command(client: Client, message: Message, content: string) {
    let [subcommand, rest] = split_space(content);
    if (["finalize", "reopen", "close"].includes(subcommand)) {
        let data = database
            .prepare<{channel_id: string}, {
                initiator: string,
                finalized: boolean
            }>("SELECT initiator, finalized FROM tickets WHERE channel_id = @channel_id")
            .get({channel_id: message.channelId});
        if (!data) return await send_error(message, ErrorType.TICKETS_ONLY);
        
        let authorized = false;
        if (data.initiator == message.author.id) authorized = true;
        if (await is_admin(client, message.author.id)) authorized = true;
        if (!authorized) return await send_error(message, ErrorType.UNAUTHORIZED);
        
        if (subcommand == "finalize") {
            if (data.finalized) return await send_error(message, ErrorType.SAME_STATE);
            
            database
                .prepare<{channel_id: string}>("UPDATE tickets SET finalized = TRUE WHERE channel_id = @channel_id")
                .run({channel_id: message.channelId});
            
            await message.reply(parse_text(`===
Ticket Finalized
===
This ticket has been finalized and locked.
Reopen this ticket with \`@${client.user!.username} ticket reopen\`.`));
            await client.channels.send(environ.LOG_CHANNEL_ID, `<@${message.author.id}> has finalized the ticket in <#${message.channelId}>`);
        } else if (subcommand == "reopen") {
            if (!data.finalized) return await send_error(message, ErrorType.SAME_STATE);

            database
                .prepare<{channel_id: string}>("UPDATE tickets SET finalized = FALSE WHERE channel_id = @channel_id")
                .run({channel_id: message.channelId});
            
            await message.reply(parse_text(`===
Ticket Reopened
===
This ticket has been reopened.
Finalize this ticket with \`@${client.user!.username} ticket finalize\`.`));
            await client.channels.send(environ.LOG_CHANNEL_ID, `<@${message.author.id}> has reopened the ticket in <#${message.channelId}>`);
        } else if (subcommand == "close") {
            if (!data.finalized) return await send_error(message, "Ticket needs to be finalized to be deleted.");
            if (!await is_admin(client, message.author.id)) return await send_error(message, ErrorType.UNAUTHORIZED);

            await client.rest.delete(Routes.channel(message.channelId)); // ugly
            database
                .prepare<{channel_id: string}, unknown>(
                    "DELETE FROM tickets WHERE channel_id = @channel_id"
                )
                .run({channel_id: message.channelId});
            await client.channels.send(environ.LOG_CHANNEL_ID, `<@${message.author.id}> has deleted the ticket channel opened by <@${data.initiator}>.`);
        }
    }
}


async function create_ticket_channel(client: Client, user: User, type: TicketChannelType) {
    let user_count = database
        .prepare<{initiator: string}, number>("SELECT COUNT(channel_id) FROM tickets WHERE initiator = @initiator")
        .pluck()
        .get({initiator: user.id}) ?? 0;
    if (user_count >= environ.MAX_TICKETS_PER_USER) return;
    
    let count = database.prepare<[], number>("SELECT COUNT(channel_id) + 1 FROM tickets").pluck().get() ?? 1;
    let guild = await client.guilds.resolve(environ.GUILD_ID)!;
    let channel = await guild.createChannel({
        type: ChannelType.GuildText,
        name: `${user.username} (${count})`,
        parent_id: environ.TICKETS_CATEGORY
    });
    await channel.editPermission(user.id, {
        type: OverwriteType.Member,
        allow: resolvePermissionsToBitfield([PermissionFlags.ViewChannel])
    });

    let name = DISPLAY[type];

    let initial_message = await client.channels.send(channel.id, parse_text(`<@${user.id}>
===
${name}
===
<@${user.id}> opened a ticket for "${name}". A staff member shall assist <@${user.id}> shortly.

Use \`@${client.user!.username} ticket finalize\` to finalize this ticket.
${PREAMBLE[type]}
`));

    await initial_message.pin();

    database
        .prepare<{
            channel_id: string,
            type: number,
            initiator: string,
        }>("INSERT INTO tickets (channel_id, type, initiator, finalized) VALUES (@channel_id, @type, @initiator, FALSE)")
        .run({
            channel_id: channel.id, type, initiator: user.id
        });

    await client.channels.send(environ.LOG_CHANNEL_ID, `<@${user.id}> opened a ${name} ticket at <#${channel.id}>`);

    if (type == TicketChannelType.BOT_INVITE) {
        await bot_invite_app(client, initial_message, user.id, channel.id);
    }
}
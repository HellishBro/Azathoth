import { environ } from "./../env.js";
import { get_scripted_message_id, register_script } from "./scripts.js";
import { parse_text, run_script } from "./scripted_messages.js";
import { with_client } from "../event.js";
import { ChannelType, Client, Events, OverwriteType, PermissionFlags, resolvePermissionsToBitfield, User } from "@fluxerjs/core";
import { database } from "../db/db.js";

enum TicketChannelType {
    ADMINISTRATIVE, BOT_INVITE
}

let DISPLAY: {[key in TicketChannelType]: string};
let PREAMBLE: {[key in TicketChannelType]: string};

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

    let contact_message_id: {
        message_id: string,
        channel_id: string
    } | undefined = undefined;

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
            let message = await run_script(client, "make_contacts", environ.CONTACT_CHANNEL_ID);
            contact_message_id = undefined;
            if (message) {
                await message.react("🛠️");
                await message.react("🤖");
            }
        }
    ),
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
                contact_message_id = get_scripted_message_id("make_contacts");
            }
            if (!contact_message_id) return;
            if (!(message_id == contact_message_id.message_id && channel_id == contact_message_id.channel_id)) return;
            console.log(emoji);
            if (emoji.name == "🛠️") {
                await create_ticket_channel(client, user, TicketChannelType.ADMINISTRATIVE);
            } else if (emoji.name == "🤖") {
                await create_ticket_channel(client, user, TicketChannelType.BOT_INVITE);
            }
            (await reaction.fetchMessage()).removeReaction(emoji, user.id);
        })
    });
}

async function create_ticket_channel(client: Client, user: User, type: TicketChannelType) {
    let user_count = database
        .prepare<{initiator: string}, number>("SELECT COUNT(id) FROM tickets WHERE initiator = @initiator")
        .get({initiator: user.id}) ?? 0;
    if (user_count > environ.MAX_TICKETS_PER_USER) return;
    
    let count = database.prepare<[], number>("SELECT COUNT(id) + 1 FROM tickets").get() ?? 1;
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

    database
        .prepare<{
            channel_id: string,
            type: number,
            initiator: string
        }>("INSERT INTO tickets (channel_id, type, initiator) VALUES (@channel_id, @type, @initiator)")
        .run({
            channel_id: channel.id, type, initiator: user.id
        });

    let name = DISPLAY[type];

    await client.channels.send(channel.id, parse_text(`<@${user.id}>
===
${name}
===
<@${user.id}> opened a ticket for "${name}". A staff member shall assist <@${user.id}> shortly.
${PREAMBLE[type]}
`));
    await client.channels.send(environ.LOG_CHANNEL_ID, `<@${user.id}> opened a ${name} ticket at <#${channel.id}>`);
}
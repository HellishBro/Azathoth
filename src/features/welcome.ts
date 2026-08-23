import { Events } from "@fluxerjs/core";
import { environ } from "../env.js";
import { with_client } from "../event.js";
import { run_script } from "./scripted_messages.js";
import { get_scripted_message_id, register_script } from "./scripts.js"

let welcome_message: {
    message_id: string,
    channel_id: string
} | undefined = undefined;

export default () => {
    register_script(
        "welcome",
        "Welcome and information messages",
        "Send the welcome and information messages.",
        `# Welcome to Bot Development Guild!
This Fluxer community is your go-to for everything regarding Fluxer bots!
-# This community is not for bot support for specific bots.

Invite: https://fluxer.gg/cAy3CNcu or https://imflux.ing/botdev
===
Rules
===
All members are expected to adhere to the following rules:
1. Follow Fluxer's [Terms of Service](https://fluxer.app/terms) and [Community Guidelines](https://fluxer.app/guidelines).
2. Don't spread hate, bigotry, or harmful stuffs.
3. No NSFW and NSFL.
4. Be nice to each other and follow boundaries.

All bots are expected to adhere to follow the member rules as well as the following restrictions:
1. Guild prefix cannot be \`!\`.
2. Should not request more permissions than necessary.
3. Should not have moderator or administrator permissions.
4. Should have the guild prefix within the nickname.
5. Should not be offline for an extended amount of time.

Invited bots will be configured by administrators to ensure they adhere to the bot restrictions, so there is no need to worry for developers.
===
Who's Welcomed
===
Bots of all kinds and sizes are welcome! They don't have to be large or feature-packed. Just send the administrators a bot invite application to get your bot here!

Userbot policy: userbots are allowed, but they must adhere to both the member and bot rules, and require prior administrator approval. Small userscripts are allowed without the need to disclose; however, they mustn't read messages, presence, or guild members.
===
Agreement
===
React to the ✅ emoji to gain access to the rest of the guild!`,
        async (client) => {
            let message = await run_script(client, "welcome", environ.INFORMATION_CHANNEL);
            welcome_message = undefined;
            if (message) {
                await message.react("✅");
            }
        }
    );

    with_client("Listening to verification reaction", client => {
        client.on(Events.MessageReactionAdd, async ({
            emoji,
            user,
            messageId: message_id,
            channelId: channel_id
        }) => {
            if (user.bot) return;
            if (welcome_message == undefined) {
                welcome_message = get_scripted_message_id("welcome");
            }
            if (!welcome_message) return;
            if (!(message_id == welcome_message.message_id && channel_id == welcome_message.channel_id)) return;
            if (emoji.name == "✅") {
                let member = await (await client.guilds.fetch(environ.GUILD_ID)).fetchMember(user.id);
                if (!member || member.roles.has(environ.VERIFIED_ROLE)) return;
                await member.roles.add(environ.ADMIN_ROLE_ID);
            }
        })
    });
}
import { environ } from "./../env.js";
import { register_script } from "../scripts.js";
import { run_script } from "./scripted_messages.js";

export default register_script(
    "make_contact",
    "Make contact message",
    "Make the \"Contact Administration\" message in CONTACT_CHANNEL_ID",
    `===
Contact Administrator
===
Create a ticket to have a focused interaction with the administrators regarding private or personal issues. Bot invite applications also go here.

**Note**: This is not a place for support with individual bots.

React with 🛠️ to contact administration.
React with 🤖 to create a bot invite application.`,
    async (client) => {
        let message = await run_script(client, "make_contacts", environ.CONTACT_CHANNEL_ID);
        if (message) {
            await message.react("🛠️");
            await message.react("🤖");
        }
    }
)
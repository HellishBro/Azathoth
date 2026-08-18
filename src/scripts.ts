import { Client, EmbedBuilder } from "@fluxerjs/core";
import { environ } from "./env.js";

export async function create_tickets_message(client: Client) {
    let message = await client.channels.send(environ.CONTACT_CHANNEL_ID, {
        embeds: [
            new EmbedBuilder()
                .setTitle("Contact mod team")
                
        ]
    })
}
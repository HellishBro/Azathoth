import { Client, EmbedBuilder, Message, MessageSendOptions } from "@fluxerjs/core";
import { get_scripted_message } from "../db.js";

export function parse_text(text: string): MessageSendOptions {
    let options: MessageSendOptions = {};
    let [content, embed_title, embed_description] = text.split("===").map(t => t.trim());
    if (embed_title) {
        options.embeds = [
            new EmbedBuilder()
                .setTitle(embed_title)
                .setDescription(embed_description)
        ];
    }
    options.content = content;
    return options;
}

export async function run_script(
    client: Client,
    script: string,
    channel: string
): Promise<Message | undefined> {
    let text = get_scripted_message(script);
    if (!text)
        return undefined;
    let options = parse_text(text);
    return await client.channels.send(channel, options);
}
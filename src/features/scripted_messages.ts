import { Client, EmbedBuilder, Message, MessageSendOptions } from "@fluxerjs/core";
import { change_scripted_message_id, get_scripted_message } from "./scripts.js";

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
    console.log("run script", script);
    let text = get_scripted_message(script);
    if (!text)
        return undefined;
    let options = parse_text(text);
    let message = await client.channels.send(channel, options);
    change_scripted_message_id(script, channel, message.id);
    return message;
}
import { Client, EmbedBuilder, Message, MessageSendOptions } from "@fluxerjs/core";
import { change_scripted_message_id, get_scripted_message } from "./scripts.js";

export function parse_text(text: string): MessageSendOptions {
    let options: MessageSendOptions = {};
    let [content, ...embeds] = text.split("===").map(t => t.trim());
    if (embeds) {
        let e = [];

        for (let i = 0; i < embeds.length;) {
            e.push(
                new EmbedBuilder()
                    .setTitle(embeds[i])
                    .setDescription(embeds[i + 1])
            );
            i += 2;
        }

        options.embeds = e;
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
    let message = await client.channels.send(channel, options);
    change_scripted_message_id(script, channel, message.id);
    return message;
}
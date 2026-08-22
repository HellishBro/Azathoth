import { Client, EmbedBuilder, GuildChannel, Message } from "@fluxerjs/core";
import { upsert_scripted_message, get_scripted_message, get_scripted_message_id } from "./db.js";
import { parse_text } from "./features/scripted_messages.js";
import { split_space } from "./util.js";

interface ScriptInfo {
    name: string,
    description: string,
    func: (client: Client) => Promise<void>
}

let scripts: Record<string, ScriptInfo> = {};

export function register_script(
    invoke: string,
    name: string,
    description: string,
    text: string,
    func: (client: Client) => Promise<void>
): () => void {
    return () => {
        scripts[invoke] = { name, description, func };
        upsert_scripted_message(invoke, text);
        console.log(`Registered script ${invoke}`);
    };
}

export async function parse_scripts_command(
    client: Client,
    message: Message,
    content: string
) {
    let [subcommand, rest] = split_space(content);

    if (["run", "edit", "info", "finalize"].includes(subcommand)) {
        let [key, r] = split_space(rest);
        if (!(key in scripts)) {
            await message.reply(`${key} is not a valid script!`);
            return;
        }
        let script = scripts[key];
        if (subcommand == "run") {
            let msg = await message.reply(`Executing script ${key}.`);
            await script.func(client);
            await msg.reply("Finished executing script.");
        } else if (subcommand == "edit") {
            let text = get_scripted_message(key);
            let command = `<@${client.user!.id}> scripts finalize ${key}\n${text}`;
            await message.reply(command);
        } else if (subcommand == "info") {
            let message_id = get_scripted_message_id(key);
            let text = get_scripted_message(key);
            let embed = new EmbedBuilder()
                .setTitle(`Script "${script.name}"`)
                .setDescription(script.description)
                .addFields({
                    name: "Invocation",
                    value: key,
                })
                .addFields({
                    name: "Message",
                    value: message_id.channel_id ? `https://web.fluxer.app/channels/${
                        (await client.channels.resolve(message_id.channel_id) as GuildChannel).guildId
                    }/${message_id.channel_id}/${message_id.message_id}` : "N/A"
                })
                .addFields({
                    name: "Text",
                    value: text ?? "N/A"
                });
            await message.reply({
                embeds: [embed]
            })
        } else if (subcommand == "finalize") {
            console.log([rest, r]);
            upsert_scripted_message(key, r);
            await (await message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("Script Edited")
                        .setDescription(`Script updated to\n${r}\n\nPreview:`)
                ]
            })).reply(parse_text(r));
        }
    }
}
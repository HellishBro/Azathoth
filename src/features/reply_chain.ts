import { Client, Events, Message } from "@fluxerjs/core";
import { ErrorType, send_error } from "../util.js";
import { database } from "../db/db.js";

interface Question {
    ident: string,
    question: string,
    validate: (message: string, data_so_far: Record<string, string>, raw_message: Message) => Promise<string | undefined>
}

export function validate_mention<T extends "user" | "channel" | "role">(
    type: T,
    validate?: (item: string) => Promise<boolean>
): (message: string) => Promise<string | undefined> {
    return async (message: string) => {
        let res: RegExpExecArray | null = null;
        if (type == "user" && !(res = /^<@(\d+?)>$/g.exec(message))) return;
        if (type == "channel" && !(res = /^<#(\d+?)>$/g.exec(message))) return;
        if (type == "role" && !(res = /^<@&(\d+?)>$/g.exec(message))) return;
        if (!res || !res.groups) return;
        if (await (validate ?? (async () => true))(res.groups[1])) return res.groups[1];
        return;
    }
}

export function validate_id(): (message: string) => Promise<string | undefined> {
    return async (message) => /^\d+$/g.test(message) ? message : undefined;
}

interface ReplyChain<Q extends readonly Question[]> {
    questions: Q,
    callback: (client: Client, data: Record<string, string>, stage: ReplyChainStage, last_message: Message) => Promise<void>
}

let reply_chains: Record<string, ReplyChain<readonly Question[]>> = {}

export function register_reply_chain(name: string, chain: ReplyChain<readonly Question[]>) {
    reply_chains[name] = chain;
    console.log(`Registered reply chain ${name}.`);
}

interface ReplyChainStage {
    channel_id: string,
    message_id: string
    initiator: string,
    reply_chain_id: string,
    stage: number,
    data: Record<string, string>
}

interface ReplyChainStageDB {
    channel_id: string,
    message_id: string,
    initiator: string,
    reply_chain_id: string,
    stage: number,
    data: string
}

function create_reply_chain_db(stage: ReplyChainStage) {
    database
        .prepare<ReplyChainStageDB, unknown>(
            `INSERT INTO reply_chain (channel_id, message_id, initiator, reply_chain_id, stage, data)
            VALUES (@channel_id, @message_id, @initiator, @reply_chain_id, @stage, @data)`
        )
        .run({
            ...stage,
            data: JSON.stringify(stage.data)
        });
}

function get_reply_chain_db(channel_id: string, message_id: string): ReplyChainStage | undefined {
    let d = (
        database
            .prepare<{channel_id: string, message_id: string}, ReplyChainStageDB>(
                `SELECT channel_id, message_id, initiator, reply_chain_id, stage, data FROM reply_chain`
            )
            .get({channel_id, message_id})
    );
    if (d) {
        return {...d, data: JSON.parse(d.data) as Record<string, string>};
    }
    return d;
}

function delete_reply_chain_db(channel_id: string, message_id: string) {
    database
        .prepare<{channel_id: string, message_id: string}, unknown>(
            "DELETE FROM reply_chain WHERE channel_id = @channel_id AND message_id = @message_id"
        )
        .run({channel_id, message_id});
}

export function register_reply_chain_listener(client: Client) {
    client.on(Events.MessageCreate, async (message) => {
        if (!message.messageReference) return;
        let parent_message_id = message.messageReference.message_id;
        
        let stage = get_reply_chain_db(message.channelId, parent_message_id);
        if (!stage) return;
        if (message.author.id != stage.initiator) return;

        let questions = reply_chains[stage.reply_chain_id].questions;
        let question = questions[stage.stage];
        let new_message: Message;
        let next_stage = {...stage};

        delete_reply_chain_db(message.channelId, parent_message_id);
        if ((await question.validate(message.content, next_stage.data, message)) != null) {
            next_stage.data[question.ident] = message.content;
            next_stage.stage += 1;
            if (next_stage.stage >= questions.length) {
                await reply_chains[stage.reply_chain_id].callback(client, next_stage.data, next_stage, message);
                return;
            }
            new_message = await message.reply(questions[next_stage.stage].question);
        } else {
            new_message = await send_error(message, ErrorType.REPLY_CHAIN_INVALID);
        }
        next_stage.message_id = new_message.id;
        create_reply_chain_db(next_stage);
    });
};

export async function init_reply_chain(message: Message, chain_id: string, initiator?: string, initial_data?: Record<string, string>) {
    let msg = await message.reply("Use the reply feature to answer.\n" + reply_chains[chain_id].questions[0].question);
    let stage: ReplyChainStage = {
        channel_id: message.channelId,
        message_id: msg.id,
        initiator: initiator ?? message.author.id,
        reply_chain_id: chain_id,
        stage: 0,
        data: initial_data ?? {}
    };
    create_reply_chain_db(stage);
}
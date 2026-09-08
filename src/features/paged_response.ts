import { Events, Message, MessageSendOptions } from "@fluxerjs/core";
import { with_client } from "../event.js";

const LEFT = "⬅️";
const RIGHT = "➡️";
const REFRESH = "🔄";

interface PagedResponse {
    message_id: string,
    channel_id: string,
    maximum_page: () => number,
    get_page: (page: number) => Promise<MessageSendOptions>,
    page: number
}

let paged_responses: PagedResponse[] = [];

export default () => {
    with_client("Listening for paged response reactions", client => {
        client.on(Events.MessageReactionAdd, async ({
            reaction,
            emoji,
            user,
            messageId: message_id,
            channelId: channel_id
        }) => {
            let index = paged_responses.findIndex(v => v.channel_id == channel_id && v.message_id == message_id);
            if (index == -1) return;

            let response = paged_responses[index];
            if (emoji.name == LEFT) {
                response.page -= 1;
            } else if (emoji.name == RIGHT) {
                response.page += 1;
            } else if (emoji.name != REFRESH) return;
            
            response.page = Math.max(Math.min(response.page, response.maximum_page()), 0);
            let new_page = await response.get_page(response.page);

            let message = await client.channels.fetchMessage(response.channel_id, response.message_id);
            await message.edit(new_page);
            
            await (await reaction.fetchMessage()).removeReaction(emoji, user.id);
        })
    })
}


export async function paged_response(
    message: Message,
    maximum_page: () => number,
    get_page: (page: number) => Promise<MessageSendOptions>
) {
    let first_page = await get_page(0);

    let response = await message.reply(first_page);
    await response.react(LEFT);
    await response.react(RIGHT);
    await response.react(REFRESH);

    paged_responses.push({
        message_id: response.id,
        channel_id: response.channelId,
        maximum_page,
        get_page,
        page: 0
    });
}
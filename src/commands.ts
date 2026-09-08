import { Channel, Client, EmbedBuilder, Message, Role, User } from "@fluxerjs/core";
import { ErrorType, is_admin, send_error, split_space } from "./util.js";
import { environ } from "./env.js";

export enum PermissionLevel {
    REGULAR, ADMIN
}

export type ArgumentType = (
    "str" | "int" | "float" | "user" | "channel" | "role" | "snowflake" | "greedystr" |
    { list: ArgumentType } | { options: readonly string[] }
)

type RawArgumentTypeT<T extends ArgumentType> = (
    T extends "str"         ? string    :
    T extends "int"         ? number    :
    T extends "float"       ? number    :
    T extends "user"        ? User      :
    T extends "channel"     ? Channel   :
    T extends "role"        ? Role      :
    T extends "snowflake"   ? string    :
    T extends "greedystr"   ? string    :
    T extends { list: infer B extends ArgumentType } ? RawArgumentTypeT<B>[] :
    T extends { options: infer I extends readonly string[] } ? I[number] : never
)

type ArgumentTypeT<T extends ArgumentType, optional extends boolean> = (
    optional extends true ? (RawArgumentTypeT<T> | undefined) : RawArgumentTypeT<T>
)

export abstract class CommandLike {
    constructor(
        public readonly name: string,
        public readonly description: string,
        public readonly permission: PermissionLevel
    ) {}
}

export class CommandGroup extends CommandLike {
    constructor(
        public readonly name: string,
        public readonly description: string,
        public readonly permission: PermissionLevel,
        public commands: CommandLike[]
    ) {
        super(name, description, permission);
    }
}

interface Arg<N extends string, T extends ArgumentType> {
    readonly name: N,
    readonly description: string,
    readonly type: T,
    readonly optional?: boolean
}

function type_display(type: ArgumentType): string {
    if (typeof type == "object") {
        if ("list" in type) return type_display(type.list) + "[]";
        if ("options" in type) return type.options.join(" | ");
    }
    let mapping = {
        str: "string",
        int: "integer",
        float: "number",
        user: "user mention",
        channel: "channel mention",
        role: "role mention",
        snowflake: "snowflake",
        greedystr: "string"
    };
    return mapping[type];
}

function arg_display(arg: Arg<string, ArgumentType>): string {
    if (arg.optional) {
        return `[${arg.name}]`;
    }
    return `<${arg.name}>`;
}

type Boolable<T extends boolean | undefined> = T extends undefined ? false : T;

type ArgT<Args extends readonly Arg<string, ArgumentType>[]> = {
    [key in Args[number]["name"]] : ArgumentTypeT<
        Extract<Args[number], { name: key }>["type"],
        Boolable<Extract<Args[number], { name: key }>["optional"]>
    >
};

export class Command<Args extends readonly Arg<string, ArgumentType>[] = []> extends CommandLike {
    constructor(
        public readonly name: string,
        public readonly description: string,
        public readonly permission: PermissionLevel,
        public readonly args: Args,
        public readonly callback: (args: ArgT<Args>) => (client: Client, message: Message) => Promise<void>
    ) {
        super(name, description, permission);
    }
}

let command_registry: CommandLike[] = [
    new Command(
        "help",
        "Shows a list of commands",
        PermissionLevel.REGULAR,
        [
            {
                name: "command",
                description: "The command to get help for",
                type: "greedystr",
                optional: true
            }
        ],
        ({command}) => async (client, message) => {
            if (command) {
                await help_for(client, message, command);
            } else {
                await help_default(client, message);
            }
        }
    )
];


function get_command_candidate(
    content: string,
    candidates: CommandLike[],
    user_permission: PermissionLevel
): [string, CommandLike] | undefined {
    let path = "";
    let [command, rest] = split_space(content);
    for (let command_like of candidates) {
        path = command_like.name;
        if (command == command_like.name && user_permission >= command_like.permission) {
            if (command_like instanceof CommandGroup) {
                if (rest) {
                    let subcandidate = get_command_candidate(rest, command_like.commands, user_permission);
                    if (subcandidate) return [(path == "" ? path : (path + " ")) + subcandidate[0], subcandidate[1]];
                }
                return [path, command_like];
            } else if (command_like instanceof Command) {
                return [path, command_like];
            }
        }
    }
}



async function help_for(client: Client, message: Message, command: string) {
    let permission_level = (
        await is_admin(client, message.author.id)
        ? PermissionLevel.ADMIN
        : PermissionLevel.REGULAR
    );
    let dat = get_command_candidate(command, command_registry, permission_level);
    if (dat == undefined) {
        return void await send_error(message, ErrorType.NOT_FOUND);
    }
    let [path, selected_command] = dat;
    let embed = new EmbedBuilder();
    embed = embed.setTitle(path);
    let description_list: string[] = [];
    if (selected_command instanceof Command) {
        description_list.push("command");
        description_list.push(`\`@${client.user!.username} ${path} ${
            (selected_command.args as Arg<string, ArgumentType>[]).map(
                v => arg_display(v)
            ).join(" ")
        }\``);
        description_list.push(selected_command.description);
        for (let arg of selected_command.args) {
            embed = embed.addFields({
                name: arg.name,
                value: `\`${
                    type_display(arg.type)
                }${
                    (arg.optional ?? false) ? '?' : ''
                }\`\n${
                    arg.description
                }`,
                inline: true
            });
        }
    } else if (selected_command instanceof CommandGroup) {
        description_list.push("command group");
        description_list.push(selected_command.name);
        description_list.push(selected_command.description);
        description_list.push("");
        description_list.push("Commands:");
        description_list.push(list_commands(
            client.user!.username,
            path,
            selected_command.commands,
            permission_level
        ));
    }

    let description = description_list.join("\n");
    embed = embed.setDescription(description);
    await message.reply({embeds: [embed]});
}


function list_commands(prefix: string, path: string, lst: CommandLike[], permission_level: PermissionLevel): string {
    let out: string[] = [];
    for (let command of lst) {
        if (command.permission > permission_level) continue;
        if (command instanceof Command) {
            out.push(`- \`@${prefix} ${path} ${command.name} ${
                (command.args as Arg<string, ArgumentType>[]).map(
                    v => arg_display(v)
                ).join(" ")
            }\``.replaceAll("  ", " "));
        } else if (command instanceof CommandGroup) {
            out.push(`- /${command.name}...`);
        }
    }
    return out.join("\n");
}


async function help_default(client: Client, message: Message) {
    let description_list: string[] = [
        "Private community bot.",
        "",
    ];
    let permission_level = (
        await is_admin(client, message.author.id)
        ? PermissionLevel.ADMIN
        : PermissionLevel.REGULAR
    );

    for (let group of command_registry.filter(c => c instanceof CommandGroup)) {
        if (group.permission > permission_level) continue;
        description_list.push(`**${group.name}**`);
        description_list.push(list_commands(
            client.user!.username,
            group.name,
            group.commands,
            permission_level
        ));
        description_list.push("");
    }

    description_list.push("**others**");
    description_list.push(list_commands(
        client.user!.username,
        "",
        command_registry.filter(c => c instanceof Command),
        permission_level
    ));

    await message.reply({embeds: [
        new EmbedBuilder()
            .setTitle("Azathoth help")
            .setDescription(description_list.join("\n"))
    ]});
}


export function register_command(command_like: CommandLike) {
    command_registry.push(command_like);
    command_registry.sort((a, b) => b.name.length - a.name.length);
}

async function get_one<Optional extends boolean>(
    client: Client,
    string: string | undefined,
    arg: ArgumentType,
    optional: Optional
): Promise<[string, ArgumentTypeT<typeof arg, Optional>]> {
    let value: ArgumentTypeT<typeof arg, Optional>;
    if (!string || string.length == 0) {
        // @ts-expect-error
        if (optional) return [string, undefined];
        throw new Error("Unexpected end of input");
    }
    if (arg == "greedystr") {
        return ["", string];
    } else if (typeof arg == "object") {
        if ("list" in arg) {
            value = [];
            while (string) {
                let [new_string, next_dat]: [
                    string,
                    ArgumentTypeT<typeof arg["list"], false>
                ] = await get_one<false>(client, string, arg.list, false);
                string = new_string;
                value.push(next_dat);
            }
        } else if ("options" in arg) {
            [value, string] = split_space(string);
            if (!arg.options.includes(value)) {
                throw new Error(`invalid option. Expected one of \`${arg.options.join("`, `")}\``);
            }
        } else {
            throw new Error("Unknown type");
        }
    } else if (arg == "str") {
        let quote = string.charAt(0);
        if ([`"'`].includes(quote)) {
            let re = new RegExp(`${quote}(?:\\${quote}|.)+?${quote}`);
            let first_match = re.exec(string);
            if (first_match == null) {
                throw new Error("Unclosed string");
            }
            value = first_match[0];
            string = string.substring(value.length).trim();
        } else {
            [value, string] = split_space(string);
        }
    } else {
        let [next, new_string] = split_space(string);
        string = new_string;
        if (arg == "snowflake") {
            value = next;
        } else if (arg == "float") {
            try {
                value = parseFloat(next);
            } catch (e) {
                throw new Error("Bad number");
            }
        } else if (arg == "int") {
            try {
                value = parseInt(next);
            } catch (e) {
                throw new Error("Bad number");
            }
        } else if (arg == "channel" || arg == "role" || arg == "user") {
            let reg: RegExp;
            if (arg == "channel") {
                reg = /<#(\d+?)>/;
            } else if (arg == "role") {
                reg = /<@&(\d+?)>/;
            } else {
                reg = /<@(\d+?)>/;
            }

            if (!reg.test(next)) throw new Error("Bad mention");
            let snowflake = reg.exec(next)![1];
            
            try {
                if (arg == "channel") {
                    value = await client.channels.fetch(snowflake);
                } else if (arg == "role") {
                    let role = client.guilds.get(environ.GUILD_ID)!.roles.get(snowflake);
                    if (role == undefined) throw new Error();
                    value = role;
                } else {
                    value = await client.users.fetch(snowflake);
                }
            } catch(e) {
                throw new Error("Unknown " + arg);
            }
        } else {
            throw new Error("Unknown type");
        }
    }
    return [string, value];
}

async function process_args<
    Args extends readonly Arg<string, ArgumentType>[]
>(client: Client, string: string, args: Args): Promise<ArgT<Args>> {
    let obj: Partial<ArgT<Args>> = {};
    for (let arg of args) {
        let [next_string, value] = await get_one(client, string, arg.type, arg.optional ?? false);
        // @ts-expect-error
        obj[arg.name] = value;
        string = next_string;
    }
    return obj as ArgT<Args>;
}

async function process_command_candidates(
    client: Client,
    message: Message,
    content: string,
    user_permission: PermissionLevel,
    candidates: CommandLike[]
) {
    let [command, rest] = split_space(content);
    for (let command_like of candidates) {
        if (command == command_like.name && user_permission >= command_like.permission) {
            if (command_like instanceof CommandGroup) {
                await process_command_candidates(client, message, rest, user_permission, command_like.commands);
                return;
            } else if (command_like instanceof Command) {
                let args: ArgT<Arg<string, ArgumentType>[]>;
                try {
                    args = await process_args(client, rest, command_like.args);
                } catch (e) {
                    await message.reply(`Error: ${e}`);
                    return;
                }
                await command_like.callback(args)(client, message);
                return;
            }
        }
    }
}

export async function parse_message(client: Client, message: Message) {
    let self_mention = `<@${client.user!.id}>`;
    if (!message.content.startsWith(self_mention)) return;
    let permission_level = (
        await is_admin(client, message.author.id)
        ? PermissionLevel.ADMIN
        : PermissionLevel.REGULAR
    );

    let stripped = message.content.slice(self_mention.length).trim();
    await process_command_candidates(
        client, message, stripped, permission_level, command_registry
    );
}
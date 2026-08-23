import { Client } from "@fluxerjs/core";

let to_run: ((client: Client) => void)[] = [];

export function with_client(name: string, callback: (client: Client) => void) {
    to_run.push(callback);
    console.log(`Registered "${name}".`);
}

export function register_events(client: Client) {
    for (let runner of to_run) {
        runner(client);
    }
}
import { environ } from "./env.js";

export interface RuntimeJson {
    static_messages: {
        contact: string
    }
}

export let runtime_json: RuntimeJson;

export function load_runtime_json() {
    let path = environ.RUNTIME_JSON;
}
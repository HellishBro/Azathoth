export interface Environ {
    TOKEN: string,
    GUILD_ID: string,
    CONTACT_CHANNEL_ID: string,
    TICKETS_CATEGORY: string,
    DATABASE: string,
    ADMIN_ROLE_ID: string
}

const ENV_VARS = [
    "TOKEN",
    "GUILD_ID",
    "CONTACT_CHANNEL_ID",
    "TICKETS_CATEGORY",
    "DATABASE",
    "ADMIN_ROLE_ID"
]

export let environ: Environ;

export function load_env(): Environ {
    let env: Partial<Environ> = {};
    let success = true;
    for (let name of ENV_VARS) {
        if (!(name in process.env)) {
            console.error(`The environmental variable ${name} is not found.`);
            success = false;
        } else {
            env[name as keyof Environ] = process.env[name];
        }
    }
    if (!success) {
        throw new Error();
    }
    environ = env as Environ;
    return environ;
}
import { z } from "zod";

const ENV_VARS = z.object({
    TOKEN: z.string(),
    GUILD_ID: z.string(),
    CONTACT_CHANNEL_ID: z.string(),
    TICKETS_CATEGORY: z.string(),
    DATABASE: z.string(),
    ADMIN_ROLE_ID: z.string(),
    RULES_CHANNEL: z.string(),
    LOG_CHANNEL_ID: z.string(),
    VERIFIED_ROLE: z.string(),
    MAX_TICKETS_PER_USER: z.coerce.number()
});

export type Environ = z.infer<typeof ENV_VARS>;

export let environ: Environ;

export function load_env(): Environ {
    environ = ENV_VARS.parse(process.env);
    return environ;
}
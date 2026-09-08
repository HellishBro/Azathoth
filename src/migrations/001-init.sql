CREATE TABLE migrations (
    used TEXT PRIMARY KEY
);

CREATE TABLE bots (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    prefix TEXT NOT NULL,
    type INTEGER NOT NULL,
    registered BOOLEAN NOT NULL,
    support_community TEXT
); -- type: 0 standard bot; 1 user bot

CREATE TABLE leaderboard_stats (
    id TEXT PRIMARY KEY,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    guilds INTEGER NOT NULL,
    guilds_regex TEXT NOT NULL,
    FOREIGN KEY (id) REFERENCES bots (id) ON DELETE CASCADE
);

CREATE TABLE scripted_messages (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    channel_id TEXT,
    message_id TEXT
);

CREATE TABLE tickets (
    channel_id TEXT PRIMARY KEY,
    type INTEGER NOT NULL,
    initiator TEXT NOT NULL,
    finalized BOOLEAN NOT NULL
);

CREATE TABLE bot_invite_tickets (
    channel_id TEXT PRIMARY KEY,
    bot_attached TEXT NOT NULL,
    provisional_permissions TEXT,
    FOREIGN KEY (bot_attached) REFERENCES bots (id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES tickets (channel_id) ON DELETE CASCADE
);

CREATE TABLE bot_commands (
    id TEXT PRIMARY KEY,
    help_command TEXT,
    ping_command TEXT,
    prefix_command TEXT,
    stats_command TEXT,
    FOREIGN KEY (id) REFERENCES bots (id) ON DELETE CASCADE
);

CREATE TABLE reply_chain (
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    initiator TEXT NOT NULL,
    reply_chain_id TEXT NOT NULL,
    stage INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (channel_id, message_id)
); -- data: json object of strings
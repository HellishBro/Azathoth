CREATE TABLE migrations (
    used TEXT PRIMARY KEY
);

CREATE TABLE bots (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    prefix TEXT NOT NULL,
    type INTEGER NOT NULL
); -- type: 0 standard bot; 1 user bot

CREATE TABLE leaderboard_stats (
    id TEXT PRIMARY KEY,
    stats_command TEXT NOT NULL,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    guilds INTEGER NOT NULL,
    guilds_regex TEXT NOT NULL,
    FOREIGN KEY (id) REFERENCES bots (id)
);

CREATE TABLE scripted_messages (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    channel_id TEXT,
    message_id TEXT
);
CREATE TABLE bot_commands (
    id TEXT PRIMARY KEY,
    help_command TEXT,
    ping_command TEXT,
    prefix_command TEXT,
    stats_command TEXT,
    FOREIGN KEY (id) REFERENCES bots (id)
);

ALTER TABLE leaderboard_stats DROP COLUMN stats_command;
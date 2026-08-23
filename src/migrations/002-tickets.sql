CREATE TABLE tickets (
    channel_id TEXT PRIMARY KEY,
    type INTEGER NOT NULL,
    initiator TEXT NOT NULL
);

CREATE INDEX tickets_initiator ON tickets (initiator);
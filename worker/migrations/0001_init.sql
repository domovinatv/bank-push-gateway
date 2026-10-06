-- Sirovi događaji s telefona. Nikad se ne brišu (vidi CLAUDE.md).
CREATE TABLE raw_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     TEXT    NOT NULL,
  seq           INTEGER NOT NULL,
  received_at   TEXT    NOT NULL,           -- ISO 8601, sat Workera
  auth_method   TEXT    NOT NULL,           -- 'hmac' | 'token'
  content_type  TEXT    NOT NULL,
  body          TEXT    NOT NULL,           -- tijelo zahtjeva, bajt za bajt
  body_sha256   TEXT    NOT NULL,
  package       TEXT,                       -- iz omotnice, radi upita; tekst banke se ne parsira
  captured_at   TEXT,
  UNIQUE (device_id, seq)
);
CREATE INDEX raw_events_received_at ON raw_events (received_at);
CREATE INDEX raw_events_package ON raw_events (package, received_at);

-- Isti (device_id, seq), drukčiji sadržaj: npr. resetiran brojač u MacroDroidu.
-- Ne gubimo ništa, samo odvajamo za ručni pregled.
CREATE TABLE raw_event_conflicts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     TEXT    NOT NULL,
  seq           INTEGER NOT NULL,
  received_at   TEXT    NOT NULL,
  auth_method   TEXT    NOT NULL,
  content_type  TEXT    NOT NULL,
  body          TEXT    NOT NULL,
  body_sha256   TEXT    NOT NULL
);

CREATE TABLE heartbeats (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     TEXT    NOT NULL,
  received_at   TEXT    NOT NULL,
  body          TEXT    NOT NULL
);
CREATE INDEX heartbeats_device ON heartbeats (device_id, received_at);

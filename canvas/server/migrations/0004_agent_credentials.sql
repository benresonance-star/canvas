CREATE TABLE IF NOT EXISTS agent_credential (
  provider     TEXT PRIMARY KEY,
  ciphertext   TEXT NOT NULL,
  iv           TEXT NOT NULL,
  key_hint     TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

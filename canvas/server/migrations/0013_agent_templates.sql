-- Database-backed agent templates and their source file parts.

CREATE TABLE IF NOT EXISTS agent_template (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  compiled    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revision    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS agent_template_file (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES agent_template(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('instructions', 'model', 'skill', 'tool')),
  filename    TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  parsed      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revision    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS agent_template_updated_idx
  ON agent_template (updated_at DESC);

CREATE INDEX IF NOT EXISTS agent_template_file_template_idx
  ON agent_template_file (template_id, kind);

-- Spec-aligned data plane (Canvas data architecture Spec)
-- Coexists with canvas_project_document during dual-write migration.

CREATE TABLE IF NOT EXISTS spec_resource (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  file_path     TEXT NOT NULL DEFAULT '',
  content_hash  TEXT NOT NULL DEFAULT '',
  version       BIGINT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS spec_project_resource (
  project_id    TEXT NOT NULL,
  resource_id   TEXT NOT NULL REFERENCES spec_resource(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, resource_id)
);

CREATE INDEX IF NOT EXISTS spec_project_resource_resource_idx
  ON spec_project_resource (resource_id);

CREATE TABLE IF NOT EXISTS spec_note (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  title         TEXT,
  file_path     TEXT NOT NULL DEFAULT '',
  version       BIGINT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS spec_note_project_idx
  ON spec_note (project_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS spec_url_link (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  url           TEXT NOT NULL,
  title         TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS spec_url_link_project_idx
  ON spec_url_link (project_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS spec_note_link (
  note_id       TEXT NOT NULL REFERENCES spec_note(id),
  resource_id   TEXT NOT NULL REFERENCES spec_resource(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (note_id, resource_id)
);

CREATE INDEX IF NOT EXISTS spec_note_link_resource_idx ON spec_note_link (resource_id);

CREATE TABLE IF NOT EXISTS spec_canvas_state (
  project_id    TEXT PRIMARY KEY,
  layout        JSONB NOT NULL DEFAULT '{"placed":[],"staging":[]}'::jsonb,
  viewport      JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  version       BIGINT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spec_chat (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  file_path     TEXT NOT NULL DEFAULT '',
  ordering      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS spec_chat_project_idx
  ON spec_chat (project_id) WHERE deleted_at IS NULL;

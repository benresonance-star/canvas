-- Canvas Music Framework MVP

CREATE TABLE IF NOT EXISTS music_transport (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS music_transport_project_active_idx
  ON music_transport (project_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS music_agent (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  artifact_id TEXT REFERENCES artifact(id) ON DELETE SET NULL,
  agent_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  state JSONB NOT NULL,
  file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS music_agent_project_idx
  ON music_agent (project_id, deleted_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS music_pattern (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES music_agent(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pattern JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS music_preset (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_id TEXT REFERENCES music_agent(id) ON DELETE SET NULL,
  agent_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  preset JSONB NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS music_version (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES music_agent(id) ON DELETE CASCADE,
  parent_version_id TEXT REFERENCES music_version(id) ON DELETE SET NULL,
  version_type TEXT NOT NULL,
  name TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  ai_explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS music_import_export (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_id TEXT REFERENCES music_agent(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,
  manifest JSONB NOT NULL,
  file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS music_blackboard (
  project_id TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

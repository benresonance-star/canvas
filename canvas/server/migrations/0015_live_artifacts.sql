-- First-class live artifacts. Postgres owns identity, configuration, history, and runs.

CREATE TABLE IF NOT EXISTS live_artifact (
  id                         TEXT PRIMARY KEY REFERENCES artifact(id) ON DELETE CASCADE,
  project_id                 TEXT NOT NULL,
  kind                       TEXT NOT NULL CHECK (kind IN ('agent_feed')),
  name                       TEXT NOT NULL,
  description                TEXT NOT NULL DEFAULT '',
  schedule_mode              TEXT NOT NULL DEFAULT 'manual'
                             CHECK (schedule_mode IN ('manual', 'daily', 'weekly')),
  preferred_time_local       TEXT NOT NULL DEFAULT '08:00',
  timezone                   TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  only_update_if_meaningful  BOOLEAN NOT NULL DEFAULT TRUE,
  minimum_change_threshold   DOUBLE PRECISION NOT NULL DEFAULT 0.25
                             CHECK (minimum_change_threshold BETWEEN 0 AND 1),
  max_source_chars           INTEGER NOT NULL DEFAULT 24000
                             CHECK (max_source_chars BETWEEN 1000 AND 200000),
  provider                   TEXT NOT NULL DEFAULT 'openai',
  model                      TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  reasoning_effort           TEXT,
  system_prompt              TEXT NOT NULL,
  current_version_id         TEXT,
  export_filename            TEXT,
  folder_export_status       TEXT NOT NULL DEFAULT 'not_configured'
                             CHECK (folder_export_status IN
                               ('not_configured', 'pending', 'exported', 'failed')),
  exported_version_id        TEXT,
  last_run_at                TIMESTAMPTZ,
  next_run_at                TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS live_artifact_project_idx
  ON live_artifact(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS live_artifact_due_idx
  ON live_artifact(next_run_at)
  WHERE is_active = TRUE AND schedule_mode <> 'manual';

CREATE TABLE IF NOT EXISTS live_artifact_version (
  id                    TEXT PRIMARY KEY,
  live_artifact_id      TEXT NOT NULL REFERENCES live_artifact(id) ON DELETE CASCADE,
  version_number        INTEGER NOT NULL CHECK (version_number > 0),
  title                 TEXT NOT NULL,
  report_date           DATE NOT NULL,
  overview              TEXT NOT NULL,
  markdown_body         TEXT NOT NULL,
  structured_json       JSONB NOT NULL,
  source_label          TEXT,
  provider              TEXT NOT NULL,
  model                 TEXT NOT NULL,
  reasoning_effort      TEXT,
  created_by            TEXT NOT NULL DEFAULT 'system',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (live_artifact_id, version_number)
);

ALTER TABLE live_artifact
  ADD CONSTRAINT live_artifact_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES live_artifact_version(id) ON DELETE SET NULL;
ALTER TABLE live_artifact
  ADD CONSTRAINT live_artifact_exported_version_fk
  FOREIGN KEY (exported_version_id) REFERENCES live_artifact_version(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS live_artifact_source (
  id                TEXT PRIMARY KEY,
  live_artifact_id  TEXT NOT NULL REFERENCES live_artifact(id) ON DELETE CASCADE,
  source_type       TEXT NOT NULL CHECK (source_type IN
                      ('previous_version', 'manual_text', 'canvas_artifact',
                       'canvas_note', 'project_assumptions')),
  source_id         TEXT,
  label             TEXT NOT NULL,
  manual_text       TEXT,
  is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS live_artifact_source_feed_idx
  ON live_artifact_source(live_artifact_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS live_artifact_run (
  id                    TEXT PRIMARY KEY,
  live_artifact_id      TEXT NOT NULL REFERENCES live_artifact(id) ON DELETE CASCADE,
  status                TEXT NOT NULL CHECK (status IN
                          ('queued', 'running', 'succeeded',
                           'skipped_no_meaningful_change', 'failed')),
  trigger_type          TEXT NOT NULL CHECK (trigger_type IN ('manual', 'scheduled', 'test')),
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at           TIMESTAMPTZ,
  source_char_count     INTEGER,
  output_char_count     INTEGER,
  created_version_id    TEXT REFERENCES live_artifact_version(id) ON DELETE SET NULL,
  change_score          DOUBLE PRECISION,
  error_message         TEXT,
  provider              TEXT,
  model                 TEXT,
  reasoning_effort      TEXT,
  raw_response          JSONB
);

CREATE INDEX IF NOT EXISTS live_artifact_run_feed_idx
  ON live_artifact_run(live_artifact_id, started_at DESC);

CREATE TABLE IF NOT EXISTS project_update_event (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL,
  artifact_id       TEXT REFERENCES artifact(id) ON DELETE CASCADE,
  version_id        TEXT REFERENCES live_artifact_version(id) ON DELETE CASCADE,
  live_artifact_id  TEXT REFERENCES live_artifact(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,
  title             TEXT NOT NULL,
  body              TEXT,
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_update_event_unread_idx
  ON project_update_event(project_id, created_at DESC) WHERE is_read = FALSE;

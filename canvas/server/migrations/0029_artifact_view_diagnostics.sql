CREATE TABLE IF NOT EXISTS artifact_view_diagnostic (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  project_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('shadow', 'canonical')),
  event_type TEXT NOT NULL CHECK (event_type IN ('comparison', 'read_fallback')),
  category TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS artifact_view_diagnostic_project_time_idx
  ON artifact_view_diagnostic (project_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS artifact_view_diagnostic_rollout_idx
  ON artifact_view_diagnostic (mode, event_type, category, occurred_at DESC);

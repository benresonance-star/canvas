-- Canvas project documents (index + per-project canvas JSON) for cross-browser sync

CREATE TABLE IF NOT EXISTS canvas_workspace_index (
  id         TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS canvas_project_document (
  project_id TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS canvas_project_document_updated_idx
  ON canvas_project_document (updated_at DESC);

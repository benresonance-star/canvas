-- Preview blobs for cross-browser card media hydration

CREATE TABLE IF NOT EXISTS canvas_preview_blob (
  cache_key    TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  content_type TEXT,
  blob         BYTEA NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS canvas_preview_blob_project_idx
  ON canvas_preview_blob (project_id);

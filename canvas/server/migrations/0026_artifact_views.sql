CREATE TABLE IF NOT EXISTS artifact_view (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  surface     TEXT NOT NULL CHECK (surface IN ('canvas', 'dock')),
  view_type   TEXT NOT NULL,
  x           DOUBLE PRECISION,
  y           DOUBLE PRECISION,
  width       DOUBLE PRECISION,
  height      DOUBLE PRECISION,
  z_index     INTEGER,
  view_state  JSONB NOT NULL DEFAULT '{}'::jsonb,
  version     BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT artifact_view_canvas_geometry CHECK (
    surface <> 'canvas'
    OR (x IS NOT NULL AND y IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS artifact_view_active_surface_unique
  ON artifact_view (project_id, artifact_id, surface, view_type)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS artifact_view_project_surface_idx
  ON artifact_view (project_id, surface, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS artifact_view_artifact_idx
  ON artifact_view (artifact_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS artifact_view_type_idx
  ON artifact_view (view_type, updated_at DESC)
  WHERE archived_at IS NULL;

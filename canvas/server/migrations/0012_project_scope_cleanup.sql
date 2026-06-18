-- Explicit project scoping and soft-delete markers for future cleanup/retention.
-- Current cleanup still uses project_cluster + cluster_member as the source of truth.

ALTER TABLE canvas_event
  ADD COLUMN IF NOT EXISTS project_id TEXT;

CREATE INDEX IF NOT EXISTS canvas_event_project_idx
  ON canvas_event (project_id, occurred_at DESC)
  WHERE project_id IS NOT NULL;

ALTER TABLE note
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS note_project_live_idx
  ON note (project_id, created_at DESC)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE assertion
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS assertion_project_live_idx
  ON assertion (project_id, created_at DESC)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE relationship
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS relationship_project_live_idx
  ON relationship (project_id, created_at DESC)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE task
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS task_project_live_idx
  ON task (project_id, created_at DESC)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;

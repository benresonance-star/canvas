-- Monotonic revision for optimistic concurrency on project documents

ALTER TABLE canvas_project_document
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE artifact
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS artifact_revision_idx ON artifact (id, revision);

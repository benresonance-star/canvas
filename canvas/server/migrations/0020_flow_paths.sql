-- Named path groups inside flow explorations (step membership metadata).

ALTER TABLE flow_document
  ADD COLUMN IF NOT EXISTS paths JSONB NOT NULL DEFAULT '[]'::jsonb;

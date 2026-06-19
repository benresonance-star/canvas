-- Flow artifacts: isolated, revisioned node/edge documents.

CREATE TABLE IF NOT EXISTS flow_document (
  id            TEXT PRIMARY KEY REFERENCES artifact(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  viewport      JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  revision      BIGINT NOT NULL DEFAULT 1,
  snapshot_path TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS flow_document_project_idx
  ON flow_document(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS flow_node (
  id             TEXT PRIMARY KEY,
  flow_id        TEXT NOT NULL REFERENCES flow_document(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('artifact', 'local')),
  artifact_id    TEXT,
  title          TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  position_x     DOUBLE PRECISION NOT NULL,
  position_y     DOUBLE PRECISION NOT NULL,
  width          DOUBLE PRECISION,
  height         DOUBLE PRECISION,
  presentation   JSONB NOT NULL DEFAULT '{}',
  CHECK (
    (kind = 'artifact' AND artifact_id IS NOT NULL)
    OR (kind = 'local' AND artifact_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS flow_node_flow_idx ON flow_node(flow_id);
CREATE INDEX IF NOT EXISTS flow_node_artifact_idx ON flow_node(artifact_id);

CREATE TABLE IF NOT EXISTS flow_edge (
  id             TEXT PRIMARY KEY,
  flow_id        TEXT NOT NULL REFERENCES flow_document(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES flow_node(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES flow_node(id) ON DELETE CASCADE,
  source_handle  TEXT,
  target_handle  TEXT,
  label          TEXT NOT NULL DEFAULT '',
  presentation   JSONB NOT NULL DEFAULT '{}',
  CHECK (source_node_id <> target_node_id)
);

CREATE INDEX IF NOT EXISTS flow_edge_flow_idx ON flow_edge(flow_id);

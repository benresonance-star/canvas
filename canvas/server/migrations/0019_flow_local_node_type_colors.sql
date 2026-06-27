-- Per-flow local node type header colors (hex map keyed by type id).

ALTER TABLE flow_document
  ADD COLUMN IF NOT EXISTS local_node_type_colors JSONB NOT NULL DEFAULT '{}'::jsonb;

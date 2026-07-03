-- Per-action 3D diagnostics concentrate layouts (workspace-global UI prefs)

CREATE TABLE IF NOT EXISTS diagnostics_concentrate_layout (
  action_id      TEXT NOT NULL,
  spec_version   TEXT NOT NULL,
  node_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  edge_anchors   JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (action_id, spec_version)
);

CREATE INDEX IF NOT EXISTS diagnostics_concentrate_layout_spec_idx
  ON diagnostics_concentrate_layout (spec_version);

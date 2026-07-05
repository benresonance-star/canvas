-- Named BIM viewport style presets (clay, wireframe, lighting, background).

CREATE TABLE IF NOT EXISTS bim_style_preset (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  artifact_id    TEXT,
  card_id        TEXT,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  tags           TEXT[] NOT NULL DEFAULT '{}',
  style          JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  is_favorite    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS bim_style_preset_project_idx
  ON bim_style_preset (project_id, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS bim_style_preset_card_idx
  ON bim_style_preset (project_id, card_id, deleted_at, updated_at DESC)
  WHERE card_id IS NOT NULL;

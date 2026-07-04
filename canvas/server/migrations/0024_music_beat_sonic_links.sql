-- Beat agent ↔ Sonic Studio voice links (survives agent state merges / reload)

CREATE TABLE IF NOT EXISTS music_beat_sonic_link (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES music_agent(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  sonic_card_id TEXT NOT NULL,
  sonic_studio_id TEXT,
  voice_id TEXT NOT NULL,
  state_hash TEXT,
  rendered_asset_id TEXT,
  sound_source TEXT NOT NULL DEFAULT 'sonic_voice',
  sonic_voice JSONB,
  relationship_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS music_beat_sonic_link_agent_track_active_idx
  ON music_beat_sonic_link (agent_id, track_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS music_beat_sonic_link_project_idx
  ON music_beat_sonic_link (project_id, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS music_beat_sonic_link_sonic_card_idx
  ON music_beat_sonic_link (sonic_card_id)
  WHERE deleted_at IS NULL;

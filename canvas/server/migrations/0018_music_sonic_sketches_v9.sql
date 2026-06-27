-- Canvas Sonic Sketches v9 architecture scaffold

CREATE TABLE IF NOT EXISTS music_sketch_cluster (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  semantics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS music_sketch_cluster_project_idx
  ON music_sketch_cluster (project_id, deleted_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS music_sketch (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  cluster_id TEXT REFERENCES music_sketch_cluster(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES music_agent(id) ON DELETE SET NULL,
  sketch_type TEXT NOT NULL DEFAULT 'beat',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  descriptor_graph JSONB NOT NULL DEFAULT '{}'::jsonb,
  space_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  temporal_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  moments JSONB NOT NULL DEFAULT '[]'::jsonb,
  variations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS music_sketch_project_idx
  ON music_sketch (project_id, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS music_sketch_agent_idx
  ON music_sketch (agent_id)
  WHERE agent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS music_chronicle_event (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  sketch_id TEXT REFERENCES music_sketch(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES music_agent(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  summary TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS music_chronicle_project_idx
  ON music_chronicle_event (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS music_chronicle_sketch_idx
  ON music_chronicle_event (sketch_id, created_at DESC)
  WHERE sketch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS music_project_descriptor_graph (
  project_id TEXT PRIMARY KEY,
  descriptor_graph JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS music_project_space_state (
  project_id TEXT PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS music_temporal_sketch (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  sketch_id TEXT REFERENCES music_sketch(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  topology TEXT NOT NULL DEFAULT 'digital',
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  descriptor_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
  automation JSONB NOT NULL DEFAULT '[]'::jsonb,
  variations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS music_temporal_sketch_project_idx
  ON music_temporal_sketch (project_id, deleted_at, updated_at DESC);

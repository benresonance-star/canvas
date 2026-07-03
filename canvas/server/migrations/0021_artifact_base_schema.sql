-- Base artifact schema extension.
-- Evolves the existing singular artifact primitive; does not introduce a parallel artifacts table.

CREATE TABLE IF NOT EXISTS state_machine (
  id               TEXT PRIMARY KEY,
  project_id       TEXT,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  applies_to_types TEXT[] NOT NULL DEFAULT '{}',
  states           JSONB NOT NULL DEFAULT '[]'::jsonb,
  transitions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       TEXT NOT NULL DEFAULT 'system',
  updated_by       TEXT
);

CREATE INDEX IF NOT EXISTS state_machine_project_idx
  ON state_machine (project_id, updated_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS state_machine_applies_to_types_gin
  ON state_machine USING GIN (applies_to_types);

CREATE INDEX IF NOT EXISTS state_machine_states_gin
  ON state_machine USING GIN (states);

CREATE INDEX IF NOT EXISTS state_machine_transitions_gin
  ON state_machine USING GIN (transitions);

ALTER TABLE artifact
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS current_state_id TEXT,
  ADD COLUMN IF NOT EXISTS state_machine_id TEXT REFERENCES state_machine(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capabilities TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'system:migration',
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_schema_version INTEGER,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE artifact
SET
  created_at = COALESCE(created_at, retrieved_at, NOW()),
  updated_at = COALESCE(updated_at, retrieved_at, NOW()),
  title = COALESCE(
    NULLIF(title, ''),
    NULLIF(metadata->>'title', ''),
    NULLIF(metadata->>'name', ''),
    NULLIF(metadata->>'filename', ''),
    uri
  ),
  project_id = COALESCE(
    project_id,
    NULLIF(metadata->>'projectId', ''),
    NULLIF(metadata->>'project_id', '')
  ),
  capabilities = CASE
    WHEN array_length(capabilities, 1) IS NOT NULL THEN capabilities
    WHEN type = 'agent' THEN ARRAY['canRun', 'canProduceArtifacts', 'canReference']
    WHEN type = 'flow' THEN ARRAY['canHaveState', 'canContain', 'canReference']
    WHEN type = 'live' THEN ARRAY['canRun', 'canVersion', 'canHaveState']
    WHEN type = 'image' THEN ARRAY['canReview', 'canTransform', 'canBranch', 'canReference']
    WHEN type = 'audio' THEN ARRAY['canReview', 'canTransform', 'canReference']
    WHEN type = 'video' THEN ARRAY['canReview', 'canTransform', 'canReference']
    WHEN type IN ('user_note', 'user_task', 'agent_chat') THEN ARRAY['canEdit', 'canReview', 'canReference']
    ELSE ARRAY['canReference']
  END
WHERE
  created_at IS NULL
  OR updated_at IS NULL
  OR title IS NULL
  OR project_id IS NULL
  OR array_length(capabilities, 1) IS NULL;

ALTER TABLE artifact
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS artifact_project_idx
  ON artifact (project_id, updated_at DESC)
  WHERE project_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS artifact_type_idx
  ON artifact (type);

CREATE INDEX IF NOT EXISTS artifact_current_state_idx
  ON artifact (current_state_id)
  WHERE current_state_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS artifact_state_machine_idx
  ON artifact (state_machine_id)
  WHERE state_machine_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS artifact_archived_idx
  ON artifact (archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS artifact_updated_idx
  ON artifact (updated_at DESC);

CREATE INDEX IF NOT EXISTS artifact_capabilities_gin
  ON artifact USING GIN (capabilities);

CREATE TABLE IF NOT EXISTS artifact_event (
  id          TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  project_id  TEXT,
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_type  TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  run_id      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS artifact_event_artifact_idx
  ON artifact_event (artifact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS artifact_event_project_idx
  ON artifact_event (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS artifact_event_type_idx
  ON artifact_event (type);

CREATE INDEX IF NOT EXISTS artifact_event_created_idx
  ON artifact_event (created_at DESC);

CREATE INDEX IF NOT EXISTS artifact_event_payload_gin
  ON artifact_event USING GIN (payload);

INSERT INTO state_machine (
  id, project_id, name, description, applies_to_types, states, transitions, created_by
) VALUES
  (
    'builtin_exploration_lifecycle',
    NULL,
    'Exploration Lifecycle',
    'Default lifecycle for exploratory artifacts.',
    ARRAY['exploration', 'flow'],
    '[
      {"id":"seedling","label":"Seedling","kind":"initial"},
      {"id":"growing","label":"Growing","kind":"normal"},
      {"id":"mature","label":"Mature","kind":"normal"},
      {"id":"dormant","label":"Dormant","kind":"paused"},
      {"id":"archived","label":"Archived","kind":"terminal"}
    ]'::jsonb,
    '[
      {"id":"start_growing","fromStateId":"seedling","toStateId":"growing","label":"Start growing"},
      {"id":"mature","fromStateId":"growing","toStateId":"mature","label":"Mature exploration"},
      {"id":"pause","fromStateId":"growing","toStateId":"dormant","label":"Pause exploration"},
      {"id":"reactivate","fromStateId":"dormant","toStateId":"growing","label":"Reactivate"},
      {"id":"archive_from_seedling","fromStateId":"seedling","toStateId":"archived","label":"Archive"},
      {"id":"archive_from_growing","fromStateId":"growing","toStateId":"archived","label":"Archive"},
      {"id":"archive_from_mature","fromStateId":"mature","toStateId":"archived","label":"Archive"},
      {"id":"archive_from_dormant","fromStateId":"dormant","toStateId":"archived","label":"Archive"}
    ]'::jsonb,
    'system'
  ),
  (
    'builtin_artifact_review_lifecycle',
    NULL,
    'Artifact Review Lifecycle',
    'Default lifecycle for reviewable artifacts.',
    ARRAY['note', 'user_note', 'image', 'report', 'design_option'],
    '[
      {"id":"draft","label":"Draft","kind":"initial"},
      {"id":"under_review","label":"Under Review","kind":"normal"},
      {"id":"approved","label":"Approved","kind":"normal"},
      {"id":"rejected","label":"Rejected","kind":"terminal"},
      {"id":"published","label":"Published","kind":"terminal"}
    ]'::jsonb,
    '[
      {"id":"submit_review","fromStateId":"draft","toStateId":"under_review","label":"Submit for review"},
      {"id":"approve","fromStateId":"under_review","toStateId":"approved","label":"Approve"},
      {"id":"reject","fromStateId":"under_review","toStateId":"rejected","label":"Reject"},
      {"id":"publish","fromStateId":"approved","toStateId":"published","label":"Publish"}
    ]'::jsonb,
    'system'
  ),
  (
    'builtin_run_lifecycle',
    NULL,
    'Run Lifecycle',
    'Default lifecycle for run-like artifacts.',
    ARRAY['run'],
    '[
      {"id":"queued","label":"Queued","kind":"initial"},
      {"id":"running","label":"Running","kind":"normal"},
      {"id":"waiting","label":"Waiting","kind":"paused"},
      {"id":"succeeded","label":"Succeeded","kind":"terminal"},
      {"id":"failed","label":"Failed","kind":"error"},
      {"id":"cancelled","label":"Cancelled","kind":"terminal"}
    ]'::jsonb,
    '[
      {"id":"start","fromStateId":"queued","toStateId":"running","label":"Start"},
      {"id":"wait","fromStateId":"running","toStateId":"waiting","label":"Wait for input"},
      {"id":"resume","fromStateId":"waiting","toStateId":"running","label":"Resume"},
      {"id":"succeed","fromStateId":"running","toStateId":"succeeded","label":"Succeed"},
      {"id":"fail","fromStateId":"running","toStateId":"failed","label":"Fail"},
      {"id":"cancel_from_queued","fromStateId":"queued","toStateId":"cancelled","label":"Cancel"},
      {"id":"cancel_from_running","fromStateId":"running","toStateId":"cancelled","label":"Cancel"},
      {"id":"cancel_from_waiting","fromStateId":"waiting","toStateId":"cancelled","label":"Cancel"}
    ]'::jsonb,
    'system'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO artifact_event (
  id, artifact_id, project_id, type, payload, actor_type, actor_id, created_at
)
SELECT
  'backfill_artifact_created_' || id,
  id,
  project_id,
  'ArtifactCreated',
  jsonb_build_object('artifactType', type, 'title', title, 'backfilled', true),
  'system',
  'system:migration',
  created_at
FROM artifact
ON CONFLICT (id) DO NOTHING;

-- Nested Studios: governed work containers with exploration surfaces.

CREATE TABLE IF NOT EXISTS studio_playbook (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  studio_kind TEXT NOT NULL CHECK (studio_kind IN ('domain', 'cognitive', 'hybrid')),
  description TEXT,
  recommended_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_output_types TEXT[] NOT NULL DEFAULT '{}',
  review_gates JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studio (
  id TEXT PRIMARY KEY REFERENCES artifact(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  studio_kind TEXT NOT NULL CHECK (studio_kind IN ('domain', 'cognitive', 'hybrid')),
  playbook_id TEXT REFERENCES studio_playbook(id) ON DELETE SET NULL,
  parent_studio_id TEXT REFERENCES studio(id) ON DELETE SET NULL,
  parent_artifact_id TEXT REFERENCES artifact(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'seeded',
  primary_surface_id TEXT,
  brief_artifact_id TEXT REFERENCES artifact(id) ON DELETE SET NULL,
  team_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studio_project_idx
  ON studio(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS studio_parent_idx
  ON studio(parent_studio_id)
  WHERE parent_studio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS studio_state_idx
  ON studio(project_id, state);

CREATE TABLE IF NOT EXISTS studio_surface (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studio(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  surface_type TEXT NOT NULL DEFAULT 'exploration',
  title TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (studio_id, artifact_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_surface_primary_unique
  ON studio_surface(studio_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS studio_surface_studio_idx
  ON studio_surface(studio_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS studio_surface_artifact_idx
  ON studio_surface(artifact_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studio_primary_surface_fk'
  ) THEN
    ALTER TABLE studio
      ADD CONSTRAINT studio_primary_surface_fk
      FOREIGN KEY (primary_surface_id) REFERENCES studio_surface(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS studio_run (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studio(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  input_artifact_ids TEXT[] NOT NULL DEFAULT '{}',
  output_artifact_ids TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studio_run_studio_idx
  ON studio_run(studio_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS studio_run_status_idx
  ON studio_run(project_id, status);

CREATE TABLE IF NOT EXISTS studio_step (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES studio_run(id) ON DELETE CASCADE,
  studio_id TEXT NOT NULL REFERENCES studio(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  performer_kind TEXT NOT NULL CHECK (performer_kind IN ('human', 'agent', 'generator', 'studio')),
  performer_ref TEXT,
  goal TEXT NOT NULL DEFAULT '',
  input_artifact_ids TEXT[] NOT NULL DEFAULT '{}',
  output_artifact_ids TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  child_studio_id TEXT REFERENCES studio(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studio_step_studio_idx
  ON studio_step(studio_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS studio_step_run_idx
  ON studio_step(run_id, updated_at DESC)
  WHERE run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS studio_context_packet (
  id TEXT PRIMARY KEY,
  source_studio_id TEXT NOT NULL REFERENCES studio(id) ON DELETE CASCADE,
  target_studio_id TEXT REFERENCES studio(id) ON DELETE SET NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  focal_question TEXT NOT NULL DEFAULT '',
  artifact_ids TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '',
  constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_outputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS studio_context_source_idx
  ON studio_context_packet(source_studio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS studio_context_target_idx
  ON studio_context_packet(target_studio_id, created_at DESC)
  WHERE target_studio_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS studio_candidate_artifact (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studio(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  underlying_artifact_id TEXT NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'under_review', 'approved', 'rejected', 'promoted')),
  provenance_run_id TEXT REFERENCES studio_run(id) ON DELETE SET NULL,
  provenance_step_id TEXT REFERENCES studio_step(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (studio_id, underlying_artifact_id)
);

CREATE INDEX IF NOT EXISTS studio_candidate_studio_idx
  ON studio_candidate_artifact(studio_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS studio_candidate_status_idx
  ON studio_candidate_artifact(project_id, status);

CREATE TABLE IF NOT EXISTS studio_promotion_decision (
  id TEXT PRIMARY KEY,
  source_studio_id TEXT NOT NULL REFERENCES studio(id) ON DELETE CASCADE,
  target_studio_id TEXT REFERENCES studio(id) ON DELETE SET NULL,
  target_artifact_id TEXT REFERENCES artifact(id) ON DELETE SET NULL,
  project_id TEXT NOT NULL,
  candidate_artifact_id TEXT NOT NULL REFERENCES studio_candidate_artifact(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('promote_new', 'attach_as_reference', 'replace_existing', 'patch_existing')),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'applied')),
  rationale TEXT NOT NULL DEFAULT '',
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS studio_promotion_source_idx
  ON studio_promotion_decision(source_studio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS studio_promotion_status_idx
  ON studio_promotion_decision(project_id, status);

CREATE TABLE IF NOT EXISTS studio_patch_proposal (
  id TEXT PRIMARY KEY,
  source_studio_id TEXT NOT NULL REFERENCES studio(id) ON DELETE CASCADE,
  target_artifact_id TEXT NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  patch_type TEXT NOT NULL CHECK (patch_type IN ('append_section', 'replace_section', 'update_fields', 'annotate', 'link_artifact')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'applied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS studio_patch_source_idx
  ON studio_patch_proposal(source_studio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS studio_patch_status_idx
  ON studio_patch_proposal(project_id, status);

INSERT INTO studio_playbook (
  id, key, title, studio_kind, description, recommended_roles,
  suggested_steps, default_output_types, review_gates
) VALUES
  (
    'builtin_generic_domain_studio',
    'generic_domain_studio',
    'Generic Domain Studio',
    'domain',
    'A reusable studio for bounded domain exploration with candidate-first outputs.',
    '["Researcher","Synthesizer","Critic"]'::jsonb,
    '["Frame the mission","Map current artifacts","Generate candidates","Review and promote"]'::jsonb,
    ARRAY['synthesis_note','reference_packet','decision_note'],
    '["candidate_review","promotion_review"]'::jsonb
  ),
  (
    'builtin_socratic_inquiry_studio',
    'socratic_inquiry_studio',
    'Socratic Inquiry Studio',
    'cognitive',
    'A cognitive studio for deep question ladders, misconception checks, and synthesis.',
    '["Socratic Questioner","Explainer","Challenger","Synthesizer"]'::jsonb,
    '["Define focal question","Build question ladder","Challenge assumptions","Synthesize recommendations"]'::jsonb,
    ARRAY['question_set','misconception_card','synthesis_note','patch_proposal'],
    '["grounding_review","parent_promotion_review"]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

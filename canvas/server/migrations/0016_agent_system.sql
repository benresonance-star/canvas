-- Canvas v5 agent system: agent types, agent artifacts, transformers, executions.

CREATE TABLE IF NOT EXISTS skill (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rule (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transformer (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  schema      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_type (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  description            TEXT NOT NULL DEFAULT '',
  default_goal           TEXT NOT NULL DEFAULT '',
  default_instructions   TEXT NOT NULL DEFAULT '',
  default_rules          JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_skills         JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_tools          JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_transformers   JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_memory_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  ui_layout              JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_rules       JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_builtin             BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_artifact (
  id                   TEXT PRIMARY KEY REFERENCES artifact(id) ON DELETE CASCADE,
  agent_type_id        TEXT NOT NULL REFERENCES agent_type(id),
  project_id           TEXT NOT NULL,
  name                 TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  goal                 TEXT NOT NULL DEFAULT '',
  instructions         TEXT NOT NULL DEFAULT '',
  rules                JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills               JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools                JSONB NOT NULL DEFAULT '[]'::jsonb,
  memory_sources       JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_preferences    JSONB NOT NULL DEFAULT '[]'::jsonb,
  transformer_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_artifact_project_idx
  ON agent_artifact(project_id, updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS agent_artifact_type_idx
  ON agent_artifact(agent_type_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS execution (
  id                         TEXT PRIMARY KEY,
  project_id                 TEXT NOT NULL,
  agent_artifact_id          TEXT REFERENCES agent_artifact(id) ON DELETE SET NULL,
  agent_type_id              TEXT REFERENCES agent_type(id) ON DELETE SET NULL,
  transformer_id             TEXT REFERENCES transformer(id) ON DELETE SET NULL,
  execution_number           INTEGER NOT NULL,
  status                     TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  inputs                     JSONB NOT NULL DEFAULT '{}'::jsonb,
  outputs                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  original_prompt_snapshot   TEXT,
  agent_prompt_snapshot      TEXT,
  logs                       JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at               TIMESTAMPTZ,
  error                      TEXT
);

CREATE INDEX IF NOT EXISTS execution_project_agent_idx
  ON execution(project_id, agent_artifact_id, execution_number DESC);

INSERT INTO skill (id, name, description) VALUES
  ('skill_prompt_engineering', 'Prompt Engineering', 'Improve and structure prompts for image generation.'),
  ('skill_reference_selection', 'Reference Selection', 'Use linked visual references deliberately.'),
  ('skill_image_critique', 'Image Critique', 'Review generated images against the stated goal.'),
  ('skill_style_consistency', 'Style Consistency', 'Maintain visual style across generated outputs.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tool (id, name, description) VALUES
  ('tool_artifact_reader', 'Artifact Reader', 'Read prompt and reference artifacts.'),
  ('tool_artifact_writer', 'Artifact Writer', 'Create generated output artifacts.'),
  ('tool_image_transformer', 'Image Transformer', 'Generate bounded image outputs from structured requests.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO transformer (id, name, kind, description, schema) VALUES
  (
    'transformer_image_generation',
    'Image Transformer',
    'image_generation',
    'Bounded image generation transformer for Canvas agent executions.',
    '{"providers":["openai","gemini","comfyui","local"],"aspectRatios":["1:1","4:3","16:9","9:16"],"qualities":["draft","standard","high"],"outputFormats":["png","jpg","webp"]}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO agent_type (
  id,
  name,
  description,
  default_goal,
  default_instructions,
  default_rules,
  default_skills,
  allowed_tools,
  allowed_transformers,
  default_memory_sources,
  ui_layout,
  validation_rules,
  is_builtin
) VALUES (
  'agent_type_image_generation',
  'Image Generation Agent',
  'Creates image outputs from note prompts and image/file references.',
  'Create useful image outputs from Canvas notes and references.',
  'Read the connected prompt note, preserve the user intent, improve clarity where helpful, and call the Image Transformer with explicit settings. Do not modify the original prompt note.',
  '[{"id":"rule_original_prompt_unchanged","name":"Original prompt remains unchanged","body":"Never edit the source prompt note during execution."},{"id":"rule_outputs_are_artifacts","name":"Outputs are artifacts","body":"Every generated image must be recorded as an Image Artifact with provenance."}]'::jsonb,
  '[{"id":"skill_prompt_engineering"},{"id":"skill_reference_selection"},{"id":"skill_image_critique"},{"id":"skill_style_consistency"}]'::jsonb,
  '[{"id":"tool_artifact_reader"},{"id":"tool_artifact_writer"},{"id":"tool_image_transformer"}]'::jsonb,
  '[{"id":"transformer_image_generation"}]'::jsonb,
  '[]'::jsonb,
  '{"sections":["identity","goal","instructions","rules","skills","tools","memorySources","modelPreferences","transformerSettings","connectedInputs","recentExecutions","outputs"]}'::jsonb,
  '[]'::jsonb,
  TRUE
)
ON CONFLICT (id) DO NOTHING;

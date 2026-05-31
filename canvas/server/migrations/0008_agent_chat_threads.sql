-- Multi-thread agent chat: per-thread sessions + thread index

ALTER TABLE canvas_agent_chat_session
  ADD COLUMN IF NOT EXISTS thread_id TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE canvas_agent_chat_session
  DROP CONSTRAINT IF EXISTS canvas_agent_chat_session_pkey;

ALTER TABLE canvas_agent_chat_session
  ADD PRIMARY KEY (project_id, connector_id, thread_id);

CREATE TABLE IF NOT EXISTS canvas_agent_chat_thread_index (
  project_id   TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  payload      JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, connector_id)
);

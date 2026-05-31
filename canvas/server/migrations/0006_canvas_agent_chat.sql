-- Agent chat sessions (structured UI state, cross-browser)

CREATE TABLE IF NOT EXISTS canvas_agent_chat_session (
  project_id   TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  payload      JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, connector_id)
);

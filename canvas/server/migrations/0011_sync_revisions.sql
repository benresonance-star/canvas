-- Revision CAS for workspace index and agent chat stores

ALTER TABLE canvas_workspace_index
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE canvas_agent_chat_session
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE canvas_agent_chat_thread_index
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

-- Canvas primitives v0.5 — initial schema (ULID stored as TEXT)

CREATE TABLE IF NOT EXISTS cluster (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  purpose           TEXT,
  scope_expr        JSONB,
  access            JSONB NOT NULL DEFAULT '{"readers":[],"writers":[]}',
  parent_cluster_id TEXT REFERENCES cluster(id),
  status            TEXT NOT NULL,
  sealed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS project_cluster (
  project_id  TEXT PRIMARY KEY,
  cluster_id  TEXT NOT NULL REFERENCES cluster(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artifact (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL,
  uri              TEXT NOT NULL,
  content_hash     TEXT NOT NULL,
  version          TEXT,
  source_authority TEXT,
  retrieved_at     TIMESTAMPTZ NOT NULL,
  payload          BYTEA,
  payload_text     TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS artifact_hash_idx ON artifact(content_hash);

CREATE TABLE IF NOT EXISTS note (
  id           TEXT PRIMARY KEY,
  target_id    TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  body         TEXT NOT NULL,
  author_chain JSONB NOT NULL,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL,
  metadata     JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS assertion (
  id             TEXT PRIMARY KEY,
  subject_id     TEXT NOT NULL,
  subject_type   TEXT NOT NULL,
  predicate      TEXT NOT NULL,
  object_id      TEXT,
  object_type    TEXT,
  object_literal JSONB,
  confidence     JSONB NOT NULL,
  scope          JSONB NOT NULL,
  status         TEXT NOT NULL,
  author_chain   JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  metadata       JSONB NOT NULL DEFAULT '{}',
  CHECK (
    (object_id IS NOT NULL AND object_literal IS NULL)
    OR
    (object_id IS NULL AND object_literal IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS assertion_subject_pred_idx ON assertion(subject_id, subject_type, predicate);
CREATE INDEX IF NOT EXISTS assertion_status_idx ON assertion(status);
CREATE INDEX IF NOT EXISTS assertion_scope_gin ON assertion USING GIN (scope);

CREATE TABLE IF NOT EXISTS relationship (
  id            TEXT PRIMARY KEY,
  from_id       TEXT NOT NULL,
  from_type     TEXT NOT NULL,
  to_id         TEXT NOT NULL,
  to_type       TEXT NOT NULL,
  type          TEXT NOT NULL,
  confidence    JSONB,
  bidirectional BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS rel_from_idx ON relationship(from_id, from_type, type);
CREATE INDEX IF NOT EXISTS rel_to_idx ON relationship(to_id, to_type, type);

CREATE TABLE IF NOT EXISTS task (
  id         TEXT PRIMARY KEY,
  intent     TEXT NOT NULL,
  type       TEXT NOT NULL,
  assignee   JSONB,
  status     TEXT NOT NULL,
  parent_id  TEXT REFERENCES task(id),
  cluster_id TEXT REFERENCES cluster(id),
  deadline   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  metadata   JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS provenance (
  primitive_id   TEXT NOT NULL,
  primitive_type TEXT NOT NULL,
  source_id      TEXT NOT NULL,
  source_type    TEXT NOT NULL,
  position       INT NOT NULL,
  PRIMARY KEY (primitive_id, primitive_type, position)
);

CREATE INDEX IF NOT EXISTS provenance_source_idx ON provenance(source_id, source_type);

CREATE TABLE IF NOT EXISTS cluster_member (
  cluster_id     TEXT NOT NULL REFERENCES cluster(id) ON DELETE CASCADE,
  primitive_id   TEXT NOT NULL,
  primitive_type TEXT NOT NULL,
  added_at       TIMESTAMPTZ NOT NULL,
  added_by       JSONB,
  PRIMARY KEY (cluster_id, primitive_id, primitive_type)
);

CREATE INDEX IF NOT EXISTS cluster_member_primitive_idx
  ON cluster_member(primitive_id, primitive_type);

CREATE TABLE IF NOT EXISTS task_io (
  task_id        TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  primitive_id   TEXT NOT NULL,
  primitive_type TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('input', 'output')),
  PRIMARY KEY (task_id, primitive_id, primitive_type, role)
);

CREATE TABLE IF NOT EXISTS canvas_event (
  id          TEXT PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor       JSONB NOT NULL,
  action      TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  target_type TEXT NOT NULL,
  before      JSONB,
  after       JSONB
);

CREATE INDEX IF NOT EXISTS canvas_event_target_idx
  ON canvas_event(target_id, target_type, occurred_at DESC);

CREATE SCHEMA IF NOT EXISTS hard_constraints;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hc_reader') THEN
    CREATE ROLE hc_reader NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO hc_reader;
GRANT SELECT ON public.assertion TO hc_reader;
GRANT SELECT ON public.relationship TO hc_reader;
GRANT SELECT ON public.cluster TO hc_reader;
GRANT USAGE ON SCHEMA hard_constraints TO hc_reader;

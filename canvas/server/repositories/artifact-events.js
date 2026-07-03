import { query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    artifactId: row.artifact_id,
    projectId: row.project_id,
    type: row.type,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    actorType: row.actor_type,
    actorId: row.actor_id,
    runId: row.run_id,
    createdAt: row.created_at,
  };
}

export async function appendArtifactEvent(input, db = { query }) {
  const id = input.id || newUlid();
  const res = await db.query(
    `INSERT INTO artifact_event
     (id, artifact_id, project_id, type, payload, actor_type, actor_id, run_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
     RETURNING *`,
    [
      id,
      input.artifactId,
      input.projectId ?? null,
      input.type,
      JSON.stringify(input.payload ?? {}),
      input.actorType,
      input.actorId,
      input.runId ?? null,
    ],
  );
  return mapEvent(res.rows[0]);
}

export async function listEventsForArtifact(artifactId, { limit = 100 } = {}, db = { query }) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const res = await db.query(
    `SELECT * FROM artifact_event
     WHERE artifact_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [artifactId, boundedLimit],
  );
  return res.rows.map(mapEvent);
}

export async function listEventsForProject(projectId, { limit = 100 } = {}, db = { query }) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const res = await db.query(
    `SELECT * FROM artifact_event
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [projectId, boundedLimit],
  );
  return res.rows.map(mapEvent);
}

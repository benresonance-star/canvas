import { query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

export function rowToStateMachine(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? '',
    appliesToTypes: row.applies_to_types ?? [],
    states: parseJson(row.states, []),
    transitions: parseJson(row.transitions, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export async function createStateMachine(input, db = { query }) {
  const id = input.id || newUlid();
  const res = await db.query(
    `INSERT INTO state_machine
     (id, project_id, name, description, applies_to_types, states, transitions, created_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
     RETURNING *`,
    [
      id,
      input.projectId ?? null,
      input.name,
      input.description ?? '',
      input.appliesToTypes ?? [],
      JSON.stringify(input.states ?? []),
      JSON.stringify(input.transitions ?? []),
      input.createdBy || 'user:local',
    ],
  );
  return rowToStateMachine(res.rows[0]);
}

export async function getStateMachineById(id, db = { query }) {
  const res = await db.query('SELECT * FROM state_machine WHERE id = $1', [id]);
  return rowToStateMachine(res.rows[0]);
}

export async function listStateMachines(projectId, db = { query }) {
  const res = projectId
    ? await db.query(
      `SELECT * FROM state_machine
       WHERE project_id = $1 OR project_id IS NULL
       ORDER BY project_id NULLS FIRST, updated_at DESC`,
      [projectId],
    )
    : await db.query('SELECT * FROM state_machine ORDER BY project_id NULLS FIRST, updated_at DESC');
  return res.rows.map(rowToStateMachine);
}

export async function updateStateMachine(id, patch, db = { query }) {
  const existing = await getStateMachineById(id, db);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  const res = await db.query(
    `UPDATE state_machine SET
       name = $2,
       description = $3,
       applies_to_types = $4,
       states = $5::jsonb,
       transitions = $6::jsonb,
       updated_by = $7,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      next.name,
      next.description ?? '',
      next.appliesToTypes ?? [],
      JSON.stringify(next.states ?? []),
      JSON.stringify(next.transitions ?? []),
      patch.updatedBy || existing.updatedBy || null,
    ],
  );
  return rowToStateMachine(res.rows[0]);
}

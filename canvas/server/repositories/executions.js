import { pool, query } from '../db.js';
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

export function rowToExecution(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    agentArtifactId: row.agent_artifact_id ?? null,
    agentTypeId: row.agent_type_id ?? null,
    transformerId: row.transformer_id ?? null,
    executionNumber: row.execution_number,
    status: row.status,
    inputs: parseJson(row.inputs, {}),
    outputs: parseJson(row.outputs, {}),
    originalPromptSnapshot: row.original_prompt_snapshot ?? '',
    agentPromptSnapshot: row.agent_prompt_snapshot ?? '',
    logs: parseJson(row.logs, []),
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    error: row.error ?? null,
  };
}

export async function listExecutionsForAgent(agentArtifactId, limit = 20) {
  const res = await query(
    `SELECT * FROM execution
     WHERE agent_artifact_id = $1
     ORDER BY execution_number DESC
     LIMIT $2`,
    [agentArtifactId, Math.max(1, Math.min(Number(limit) || 20, 100))],
  );
  return res.rows.map(rowToExecution);
}

export async function getExecution(id) {
  const res = await query('SELECT * FROM execution WHERE id = $1', [id]);
  return rowToExecution(res.rows[0]);
}

export async function createExecution({
  projectId,
  agentArtifactId,
  agentTypeId,
  transformerId,
  inputs,
  originalPromptSnapshot,
  agentPromptSnapshot,
}) {
  const id = newUlid();
  const res = await query(
    `INSERT INTO execution (
       id, project_id, agent_artifact_id, agent_type_id, transformer_id,
       execution_number, status, inputs, outputs, original_prompt_snapshot,
       agent_prompt_snapshot, logs, started_at
     )
     VALUES (
       $1,$2,$3,$4,$5,
       COALESCE((SELECT MAX(execution_number) + 1 FROM execution WHERE agent_artifact_id = $3), 1),
       'running',$6,'{}'::jsonb,$7,$8,$9,NOW()
     )
     RETURNING *`,
    [
      id,
      projectId,
      agentArtifactId,
      agentTypeId,
      transformerId,
      JSON.stringify(inputs ?? {}),
      originalPromptSnapshot ?? '',
      agentPromptSnapshot ?? '',
      JSON.stringify([{ level: 'info', message: 'Execution started', at: new Date().toISOString() }]),
    ],
  );
  return rowToExecution(res.rows[0]);
}

export async function completeExecution(id, { outputs, logs = [] } = {}) {
  const res = await query(
    `UPDATE execution
     SET status = 'completed',
         outputs = $2,
         logs = logs || $3::jsonb,
         completed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(outputs ?? {}), JSON.stringify(logs)],
  );
  return rowToExecution(res.rows[0]);
}

export async function failExecution(id, error, { logs = [] } = {}) {
  const res = await query(
    `UPDATE execution
     SET status = 'failed',
         logs = logs || $3::jsonb,
         completed_at = NOW(),
         error = $2
     WHERE id = $1
     RETURNING *`,
    [id, error?.message ?? String(error), JSON.stringify(logs)],
  );
  return rowToExecution(res.rows[0]);
}

export async function createGeneratedImageArtifacts({
  execution,
  images,
  metadata,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const artifacts = [];
    for (const image of images) {
      const id = newUlid();
      const artifactMetadata = {
        canvas_kind: 'generated_image',
        ...metadata,
        version: image.version,
        filePath: image.filePath,
        filename: image.filename,
        width: image.width,
        height: image.height,
      };
      await client.query(
        `INSERT INTO artifact (id, type, uri, content_hash, version, source_authority, retrieved_at, payload_text, metadata)
         VALUES ($1, 'image', $2, $3, $4, 'canvas.agent', NOW(), $5, $6)`,
        [
          id,
          `generated:${execution.id}:${image.version}`,
          image.contentHash,
          String(image.version),
          image.dataUrl,
          JSON.stringify(artifactMetadata),
        ],
      );
      artifacts.push({
        id,
        type: 'image',
        uri: `generated:${execution.id}:${image.version}`,
        content_hash: image.contentHash,
        payload_text: image.dataUrl,
        metadata: artifactMetadata,
      });
    }
    await client.query('COMMIT');
    return artifacts;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

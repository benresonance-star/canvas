import { query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import { validateArtifact } from '../../src/primitives/artifact.js';
import { appendEvent } from '../events.js';
import { addClusterMember } from './clusters.js';
import crypto from 'node:crypto';

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

export function defaultCapabilitiesForArtifactType(type) {
  if (type === 'agent') return ['canRun', 'canProduceArtifacts', 'canReference'];
  if (type === 'flow') return ['canHaveState', 'canContain', 'canReference'];
  if (type === 'live') return ['canRun', 'canVersion', 'canHaveState'];
  if (type === 'image') return ['canReview', 'canTransform', 'canBranch', 'canReference'];
  if (type === 'audio' || type === 'video') return ['canReview', 'canTransform', 'canReference'];
  if (['user_note', 'user_task', 'agent_chat'].includes(type)) {
    return ['canEdit', 'canReview', 'canReference'];
  }
  return ['canReference'];
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

export function rowToBaseArtifact(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    type: row.type,
    title: row.title ?? row.metadata?.title ?? row.metadata?.filename ?? row.uri,
    description: row.description ?? null,
    currentStateId: row.current_state_id ?? null,
    stateMachineId: row.state_machine_id ?? null,
    uri: row.uri,
    contentHash: row.content_hash,
    version: row.version ?? null,
    sourceAuthority: row.source_authority ?? null,
    retrievedAt: row.retrieved_at,
    payloadText: row.payload_text ?? null,
    metadata: parseJson(row.metadata, {}),
    capabilities: row.capabilities ?? defaultCapabilitiesForArtifactType(row.type),
    createdAt: row.created_at ?? row.retrieved_at,
    updatedAt: row.updated_at ?? row.retrieved_at,
    createdBy: row.created_by ?? 'system',
    updatedBy: row.updated_by ?? null,
    schemaVersion: row.schema_version ?? 1,
    contentSchemaVersion: row.content_schema_version ?? null,
    archivedAt: row.archived_at ?? null,
  };
}

export async function upsertArtifactByHash(clusterId, fields, { addToCluster = false } = {}) {
  const existing = await query(
    'SELECT * FROM artifact WHERE content_hash = $1',
    [fields.content_hash],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (
      fields.type &&
      fields.type !== 'other' &&
      row.type === 'other' &&
      fields.type !== row.type
    ) {
      await query('UPDATE artifact SET type = $2 WHERE id = $1', [row.id, fields.type]);
    }
    if (addToCluster && clusterId) {
      await addClusterMember(clusterId, { id: row.id, type: 'artifact' });
    }
    const fresh = await query('SELECT * FROM artifact WHERE id = $1', [row.id]);
    return { artifact: fresh.rows[0], created: false };
  }

  const id = newUlid();
  const artifact = {
    id,
    type: fields.type,
    uri: fields.uri,
    content_hash: fields.content_hash,
    version: fields.version ?? null,
    source_authority: fields.source_authority ?? null,
    retrieved_at: fields.retrieved_at || new Date().toISOString(),
    payload: fields.payload ?? null,
    metadata: fields.metadata || {},
  };
  validateArtifact(artifact);

  await query(
    `INSERT INTO artifact (
       id, type, uri, content_hash, version, source_authority, retrieved_at,
       payload_text, metadata, project_id, title, capabilities, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $7, $7)`,
    [
      id,
      artifact.type,
      artifact.uri,
      artifact.content_hash,
      artifact.version,
      artifact.source_authority,
      artifact.retrieved_at,
      fields.payload_text ?? null,
      JSON.stringify(artifact.metadata),
      fields.project_id ?? fields.projectId ?? artifact.metadata.projectId ?? artifact.metadata.project_id ?? null,
      fields.title ?? artifact.metadata.title ?? artifact.metadata.name ?? artifact.metadata.filename ?? artifact.uri,
      fields.capabilities ?? defaultCapabilitiesForArtifactType(artifact.type),
    ],
  );

  if (addToCluster && clusterId) {
    await addClusterMember(clusterId, { id, type: 'artifact' });
  }

  await appendEvent({
    actor: { kind: 'agent', id: 'canvas.ingest' },
    action: 'created',
    targetId: id,
    targetType: 'artifact',
    after: { id, content_hash: artifact.content_hash },
  });

  const row = await query('SELECT * FROM artifact WHERE id = $1', [id]);
  return { artifact: row.rows[0], created: true };
}

export async function getArtifactById(id) {
  const res = await query('SELECT * FROM artifact WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function getBaseArtifactById(id, db = { query }) {
  const res = await db.query('SELECT * FROM artifact WHERE id = $1', [id]);
  return rowToBaseArtifact(res.rows[0]);
}

export async function listArtifactsByProject(projectId, { includeArchived = false, limit = 500 } = {}, db = { query }) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 500, 1000));
  const res = await db.query(
    `SELECT * FROM artifact
     WHERE project_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'}
     ORDER BY updated_at DESC
     LIMIT $2`,
    [projectId, boundedLimit],
  );
  return res.rows.map(rowToBaseArtifact);
}

export async function createArtifact(input, db = { query }) {
  const id = input.id || newUlid();
  const metadata = input.metadata ?? {};
  const payloadText = input.payloadText ?? input.payload_text ?? null;
  const uri = input.uri || `canvas-artifact:${id}`;
  const contentHash =
    input.contentHash ||
    input.content_hash ||
    stableHash(`${input.type}:${input.title ?? ''}:${payloadText ?? JSON.stringify(metadata)}`);
  const retrievedAt = input.retrievedAt || new Date().toISOString();
  const artifact = {
    id,
    type: input.type,
    uri,
    content_hash: contentHash,
    version: input.version ?? '1',
    source_authority: input.sourceAuthority ?? 'canvas.artifact',
    retrieved_at: retrievedAt,
    payload: null,
    metadata,
  };
  validateArtifact(artifact);
  const title = input.title || metadata.title || metadata.name || metadata.filename || uri;
  const res = await db.query(
    `INSERT INTO artifact (
       id, type, uri, content_hash, version, source_authority, retrieved_at,
       payload_text, metadata, project_id, title, description, current_state_id,
       state_machine_id, capabilities, created_by, updated_by, created_at,
       updated_at, content_schema_version
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$7,$7,$18
     )
     RETURNING *`,
    [
      id,
      artifact.type,
      artifact.uri,
      artifact.content_hash,
      artifact.version,
      artifact.source_authority,
      artifact.retrieved_at,
      payloadText,
      JSON.stringify(metadata),
      input.projectId ?? input.project_id ?? null,
      title,
      input.description ?? null,
      input.currentStateId ?? input.current_state_id ?? null,
      input.stateMachineId ?? input.state_machine_id ?? null,
      input.capabilities ?? defaultCapabilitiesForArtifactType(input.type),
      input.createdBy || 'user:local',
      input.updatedBy ?? null,
      input.contentSchemaVersion ?? input.content_schema_version ?? null,
    ],
  );
  return rowToBaseArtifact(res.rows[0]);
}

export async function updateArtifact(id, patch, db = { query }) {
  const existing = await getBaseArtifactById(id, db);
  if (!existing) return null;
  const hasDescription = Object.hasOwn(patch, 'description');
  const hasPayloadText = Object.hasOwn(patch, 'payloadText') || Object.hasOwn(patch, 'payload_text');
  const hasMetadata = Object.hasOwn(patch, 'metadata');
  const hasCapabilities = Object.hasOwn(patch, 'capabilities');
  const hasCurrentState = Object.hasOwn(patch, 'currentStateId') || Object.hasOwn(patch, 'current_state_id');
  const hasStateMachine = Object.hasOwn(patch, 'stateMachineId') || Object.hasOwn(patch, 'state_machine_id');
  const hasContentSchemaVersion =
    Object.hasOwn(patch, 'contentSchemaVersion') || Object.hasOwn(patch, 'content_schema_version');

  const res = await db.query(
    `UPDATE artifact SET
       title = COALESCE($2, title),
       description = CASE WHEN $3 THEN $4 ELSE description END,
       content_hash = COALESCE($5, content_hash),
       payload_text = CASE WHEN $6 THEN $7 ELSE payload_text END,
       metadata = CASE WHEN $8 THEN metadata || $9::jsonb ELSE metadata END,
       capabilities = CASE WHEN $10 THEN $11 ELSE capabilities END,
       current_state_id = CASE WHEN $12 THEN $13 ELSE current_state_id END,
       state_machine_id = CASE WHEN $14 THEN $15 ELSE state_machine_id END,
       content_schema_version = CASE WHEN $16 THEN $17 ELSE content_schema_version END,
       updated_by = COALESCE($18, updated_by),
       updated_at = NOW(),
       retrieved_at = CASE WHEN $6 OR $5 IS NOT NULL THEN NOW() ELSE retrieved_at END
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.title ?? null,
      hasDescription,
      patch.description ?? null,
      patch.contentHash ?? patch.content_hash ?? null,
      hasPayloadText,
      patch.payloadText ?? patch.payload_text ?? null,
      hasMetadata,
      JSON.stringify(patch.metadata ?? {}),
      hasCapabilities,
      patch.capabilities ?? existing.capabilities,
      hasCurrentState,
      patch.currentStateId ?? patch.current_state_id ?? null,
      hasStateMachine,
      patch.stateMachineId ?? patch.state_machine_id ?? null,
      hasContentSchemaVersion,
      patch.contentSchemaVersion ?? patch.content_schema_version ?? null,
      patch.updatedBy || patch.updated_by || null,
    ],
  );
  return rowToBaseArtifact(res.rows[0]);
}

export async function archiveArtifact(id, actorId = 'user:local', db = { query }) {
  const res = await db.query(
    `UPDATE artifact
     SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW(), updated_by = $2
     WHERE id = $1
     RETURNING *`,
    [id, actorId],
  );
  return rowToBaseArtifact(res.rows[0]);
}

export async function updateArtifactState(id, currentStateId, actorId = 'user:local', db = { query }) {
  const res = await db.query(
    `UPDATE artifact
     SET current_state_id = $2, updated_at = NOW(), updated_by = $3
     WHERE id = $1
     RETURNING *`,
    [id, currentStateId, actorId],
  );
  return rowToBaseArtifact(res.rows[0]);
}

export async function listArtifactRelationships(artifactId, db = { query }) {
  const res = await db.query(
    `SELECT * FROM relationship
     WHERE deleted_at IS NULL
       AND (
         (from_id = $1 AND from_type = 'artifact')
         OR
         (to_id = $1 AND to_type = 'artifact')
       )
     ORDER BY created_at DESC`,
    [artifactId],
  );
  return res.rows.map((row) => ({
    id: row.id,
    projectId: row.project_id ?? null,
    sourceArtifactId: row.from_id,
    targetArtifactId: row.to_id,
    relationshipType: row.type,
    direction: row.from_id === artifactId ? 'outgoing' : 'incoming',
    metadata: parseJson(row.metadata, {}),
    confidence: parseJson(row.confidence, null),
    bidirectional: row.bidirectional,
    createdAt: row.created_at,
  }));
}

export async function updateArtifactContent(id, { content_hash, payload_text }) {
  const existing = await getArtifactById(id);
  if (!existing) {
    throw new Error('artifact not found');
  }
  if (existing.type !== 'user_note' && existing.type !== 'user_task' && existing.type !== 'agent_chat') {
    throw new Error('only user_note, user_task, or agent_chat artifacts can be updated in place');
  }
  const retrieved_at = new Date().toISOString();
  await query(
    `UPDATE artifact
     SET content_hash = $2, payload_text = $3, retrieved_at = $4, updated_at = $4
     WHERE id = $1`,
    [id, content_hash, payload_text ?? null, retrieved_at],
  );
  await appendEvent({
    actor: { kind: 'human', id: 'user:local' },
    action: 'updated',
    targetId: id,
    targetType: 'artifact',
    after: { content_hash },
  });
  return getArtifactById(id);
}

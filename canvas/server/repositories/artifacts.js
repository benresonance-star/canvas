import { query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import { validateArtifact } from '../../src/primitives/artifact.js';
import { appendEvent } from '../events.js';
import { addClusterMember } from './clusters.js';

export async function upsertArtifactByHash(clusterId, fields) {
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
    if (clusterId) {
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
    `INSERT INTO artifact (id, type, uri, content_hash, version, source_authority, retrieved_at, payload_text, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
    ],
  );

  if (clusterId) {
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

export async function updateArtifactContent(id, { content_hash, payload_text }) {
  const existing = await getArtifactById(id);
  if (!existing) {
    throw new Error('artifact not found');
  }
  if (existing.type !== 'user_note' && existing.type !== 'agent_chat') {
    throw new Error('only user_note or agent_chat artifacts can be updated in place');
  }
  const retrieved_at = new Date().toISOString();
  await query(
    `UPDATE artifact SET content_hash = $2, payload_text = $3, retrieved_at = $4 WHERE id = $1`,
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

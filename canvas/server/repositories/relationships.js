import { query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import { createRelationship } from '../../src/primitives/relationship.js';
import { appendEvent } from '../events.js';
import { addClusterMember } from './clusters.js';

const PG_UNIQUE_VIOLATION = '23505';

function rowToRelationship(row) {
  if (!row) return null;
  return {
    id: row.id,
    from_ref: { id: row.from_id, type: row.from_type },
    to_ref: { id: row.to_id, type: row.to_type },
    type: row.type,
    confidence: row.confidence,
    bidirectional: row.bidirectional,
    created_at: row.created_at,
    metadata:
      typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
  };
}

export async function insertRelationship(clusterId, fields) {
  const id = newUlid();
  const rel = createRelationship({
    id,
    from_ref: fields.from_ref,
    to_ref: fields.to_ref,
    type: fields.type,
    confidence: fields.confidence ?? null,
    provenance: fields.provenance,
    bidirectional: fields.bidirectional ?? false,
    metadata: fields.metadata || {},
  });

  try {
    await query(
      `INSERT INTO relationship (id, from_id, from_type, to_id, to_type, type, confidence, bidirectional, created_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)`,
      [
        id,
        rel.from_ref.id,
        rel.from_ref.type,
        rel.to_ref.id,
        rel.to_ref.type,
        rel.type,
        rel.confidence ? JSON.stringify(rel.confidence) : null,
        rel.bidirectional,
        JSON.stringify(rel.metadata),
      ],
    );
  } catch (err) {
    if (err.code === PG_UNIQUE_VIOLATION) {
      const existing = await findRelationship({
        from_ref: fields.from_ref,
        to_ref: fields.to_ref,
        type: fields.type,
      });
      if (existing) return rowToRelationship(existing);
    }
    throw err;
  }

  for (let i = 0; i < rel.provenance.length; i += 1) {
    const p = rel.provenance[i];
    await query(
      `INSERT INTO provenance (primitive_id, primitive_type, source_id, source_type, position)
       VALUES ($1, 'relationship', $2, $3, $4)`,
      [id, p.id, p.type, i],
    );
  }

  if (clusterId) {
    await addClusterMember(clusterId, { id, type: 'relationship' });
  }

  await appendEvent({
    actor: { kind: 'agent', id: 'canvas.server' },
    action: 'created',
    targetId: id,
    targetType: 'relationship',
    after: { type: rel.type },
  });

  return { ...rel, id };
}

export async function getRelationshipsForPrimitive(id, type) {
  const res = await query(
    `SELECT * FROM relationship
     WHERE (from_id = $1 AND from_type = $2) OR (to_id = $1 AND to_type = $2)
     ORDER BY created_at DESC`,
    [id, type],
  );
  return res.rows;
}

export async function findRelationship({ from_ref, to_ref, type }) {
  const res = await query(
    `SELECT * FROM relationship
     WHERE from_id = $1 AND from_type = $2 AND to_id = $3 AND to_type = $4 AND type = $5
     LIMIT 1`,
    [from_ref.id, from_ref.type, to_ref.id, to_ref.type, type],
  );
  return res.rows[0] ?? null;
}

export async function insertRelationshipIfAbsent(clusterId, fields) {
  const existing = await findRelationship({
    from_ref: fields.from_ref,
    to_ref: fields.to_ref,
    type: fields.type,
  });
  if (existing) {
    const relationship = rowToRelationship(existing);
    if (clusterId) {
      await addClusterMember(clusterId, { id: relationship.id, type: 'relationship' });
    }
    return { relationship, created: false };
  }
  const relationship = await insertRelationship(clusterId, fields);
  return { relationship, created: true };
}

export async function deleteRelationship(id) {
  await query(`DELETE FROM provenance WHERE primitive_id = $1 AND primitive_type = 'relationship'`, [id]);
  const res = await query(`DELETE FROM relationship WHERE id = $1 RETURNING id`, [id]);
  return res.rows[0] ?? null;
}

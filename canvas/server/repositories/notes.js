import { query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import { createNote } from '../../src/primitives/note.js';
import { appendEvent } from '../events.js';
import { addClusterMember } from './clusters.js';

export async function insertNote(clusterId, fields) {
  const id = newUlid();
  const note = createNote({
    id,
    target_ref: fields.target_ref,
    body: fields.body,
    author_chain: fields.author_chain,
    tags: fields.tags || [],
    metadata: fields.metadata || {},
    created_at: fields.created_at || new Date().toISOString(),
  });

  await query(
    `INSERT INTO note (id, target_id, target_type, body, author_chain, tags, created_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      note.target_ref.id,
      note.target_ref.type,
      note.body,
      JSON.stringify(note.author_chain),
      note.tags,
      note.created_at,
      JSON.stringify(note.metadata),
    ],
  );

  if (clusterId) {
    await addClusterMember(clusterId, { id, type: 'note' });
  }

  await appendEvent({
    actor: note.author_chain[note.author_chain.length - 1],
    action: 'created',
    targetId: id,
    targetType: 'note',
    after: { target: note.target_ref },
  });

  return note;
}

export async function listNotesForTarget(targetId, targetType) {
  const res = await query(
    `SELECT * FROM note WHERE target_id = $1 AND target_type = $2 ORDER BY created_at DESC`,
    [targetId, targetType],
  );
  return res.rows;
}

export async function deleteNote(id) {
  await query(
    `DELETE FROM provenance WHERE primitive_id = $1 AND primitive_type = 'note'`,
    [id],
  );
  await query(
    `DELETE FROM cluster_member WHERE primitive_id = $1 AND primitive_type = 'note'`,
    [id],
  );
  const res = await query(`DELETE FROM note WHERE id = $1 RETURNING id`, [id]);
  return res.rows[0] ?? null;
}

import { query } from '../db.js';

function parseMeta(row) {
  if (!row?.metadata) return {};
  return typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
}

export async function buildClusterGraph(clusterId) {
  const arts = await query(
    `SELECT a.id, a.type, a.uri, a.metadata
     FROM artifact a
     INNER JOIN cluster_member cm ON cm.primitive_id = a.id AND cm.primitive_type = 'artifact'
     WHERE cm.cluster_id = $1`,
    [clusterId],
  );

  const nodes = arts.rows.map((row) => {
    const meta = parseMeta(row);
    return {
      id: row.id,
      type: 'artifact',
      artifactType: row.type,
      label: meta.filename || row.uri,
      cardKey: meta.cardKey ?? null,
      uri: row.uri,
    };
  });

  const artifactIds = new Set(nodes.map((n) => n.id));

  const rels = await query(
    `SELECT r.*
     FROM relationship r
     INNER JOIN cluster_member cm ON cm.primitive_id = r.id AND cm.primitive_type = 'relationship'
     WHERE cm.cluster_id = $1`,
    [clusterId],
  );

  const relationshipEdges = rels.rows.map((row) => ({
    id: row.id,
    kind: 'relationship',
    type: row.type,
    fromId: row.from_id,
    fromType: row.from_type,
    toId: row.to_id,
    toType: row.to_type,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
  }));

  const notes = await query(
    `SELECT n.id, n.target_id, n.target_type, n.body, n.created_at
     FROM note n
     INNER JOIN cluster_member cm ON cm.primitive_id = n.id AND cm.primitive_type = 'note'
     WHERE cm.cluster_id = $1 AND n.target_type = 'artifact'`,
    [clusterId],
  );

  const noteAttachmentEdges = notes.rows
    .filter((n) => artifactIds.has(n.target_id))
    .map((row) => ({
      id: `note-attach-${row.id}`,
      kind: 'note_attachment',
      type: 'note_attachment',
      fromId: row.id,
      fromType: 'note',
      toId: row.target_id,
      toType: 'artifact',
      label: (row.body || '').split('\n')[0]?.slice(0, 48) || 'Note',
    }));

  return {
    nodes,
    edges: [...relationshipEdges, ...noteAttachmentEdges],
  };
}

export async function getArtifactEdges(artifactId) {
  const { getRelationshipsForPrimitive } = await import('./relationships.js');
  const relationships = await getRelationshipsForPrimitive(artifactId, 'artifact');
  const notes = await query(
    `SELECT id, body, created_at FROM note WHERE target_id = $1 AND target_type = 'artifact' ORDER BY created_at DESC`,
    [artifactId],
  );
  const referencedBy = await query(
    `SELECT * FROM relationship
     WHERE to_id = $1 AND to_type = 'artifact'
     ORDER BY created_at DESC`,
    [artifactId],
  );
  return {
    outgoing: relationships.filter((r) => r.from_id === artifactId && r.from_type === 'artifact'),
    incoming: referencedBy.rows,
    notesOnTarget: notes.rows,
  };
}

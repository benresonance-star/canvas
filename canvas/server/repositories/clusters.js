import { query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import { appendEvent } from '../events.js';

export async function getClusterById(id) {
  const res = await query('SELECT * FROM cluster WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function assertClusterMutable(clusterId) {
  const c = await getClusterById(clusterId);
  if (!c) throw new Error('cluster not found');
  if (c.status === 'sealed') throw new Error('cluster is sealed');
  return c;
}

export async function getOrCreateClusterForProject(projectId, name = 'Project') {
  const existing = await query(
    'SELECT cluster_id FROM project_cluster WHERE project_id = $1',
    [projectId],
  );
  if (existing.rows[0]) {
    const cluster = await query('SELECT * FROM cluster WHERE id = $1', [
      existing.rows[0].cluster_id,
    ]);
    return cluster.rows[0];
  }

  const id = newUlid();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO cluster (id, name, status, access, created_at, metadata)
     VALUES ($1, $2, 'active', $3, $4, '{}')`,
    [id, name, JSON.stringify({ readers: [], writers: [] }), now],
  );
  await query(
    'INSERT INTO project_cluster (project_id, cluster_id) VALUES ($1, $2)',
    [projectId, id],
  );
  await appendEvent({
    actor: { kind: 'agent', id: 'canvas.server' },
    action: 'created',
    targetId: id,
    targetType: 'cluster',
    after: { id, name },
  });
  const row = await query('SELECT * FROM cluster WHERE id = $1', [id]);
  return row.rows[0];
}

export async function resolveClusterId(projectId) {
  const res = await query(
    'SELECT cluster_id FROM project_cluster WHERE project_id = $1',
    [projectId],
  );
  return res.rows[0]?.cluster_id ?? null;
}

export async function addClusterMember(clusterId, ref, addedBy = null) {
  await query(
    `INSERT INTO cluster_member (cluster_id, primitive_id, primitive_type, added_at, added_by)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT DO NOTHING`,
    [clusterId, ref.id, ref.type, addedBy ? JSON.stringify(addedBy) : null],
  );
}

export async function createSubCluster({
  name,
  purpose = null,
  parentClusterId,
  metadata = {},
  members = [],
}) {
  const parent = await getClusterById(parentClusterId);
  if (!parent) throw new Error('parent cluster not found');
  if (!name?.trim()) throw new Error('name required');

  const id = newUlid();
  const now = new Date().toISOString();
  const access =
    typeof parent.access === 'string' ? parent.access : JSON.stringify(parent.access);

  await query(
    `INSERT INTO cluster (id, name, purpose, parent_cluster_id, status, access, created_at, metadata)
     VALUES ($1, $2, $3, $4, 'active', $5, $6, $7)`,
    [id, name.trim(), purpose, parentClusterId, access, now, JSON.stringify(metadata)],
  );

  await appendEvent({
    actor: { kind: 'human', id: 'user:local' },
    action: 'created',
    targetId: id,
    targetType: 'cluster',
    after: { id, name: name.trim(), parent_cluster_id: parentClusterId },
  });

  if (members.length > 0) {
    await addClusterMembers(id, members);
  }

  return getClusterById(id);
}

export async function listChildClusters(parentClusterId) {
  const res = await query(
    `SELECT * FROM cluster WHERE parent_cluster_id = $1 AND status != 'archived'
     ORDER BY created_at DESC`,
    [parentClusterId],
  );
  return res.rows;
}

/** All sub-clusters under a workspace cluster (direct and nested). */
export async function listAllDescendantClusters(workspaceClusterId) {
  const all = [];
  const queue = [workspaceClusterId];
  while (queue.length > 0) {
    const parentId = queue.shift();
    const children = await listChildClusters(parentId);
    for (const child of children) {
      all.push(child);
      queue.push(child.id);
    }
  }
  return all;
}

export async function getClusterMembers(clusterId) {
  const res = await query(
    `SELECT a.id, a.type, a.uri, a.metadata, cm.added_at
     FROM cluster_member cm
     INNER JOIN artifact a ON a.id = cm.primitive_id AND cm.primitive_type = 'artifact'
     WHERE cm.cluster_id = $1
     ORDER BY cm.added_at DESC`,
    [clusterId],
  );
  return res.rows.map((row) => {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    return {
      id: row.id,
      type: 'artifact',
      label: meta?.filename || meta?.name || row.uri,
      cardKey: meta?.cardKey ?? null,
      artifactType: row.type,
      added_at: row.added_at,
    };
  });
}

export async function addClusterMembers(clusterId, refs) {
  await assertClusterMutable(clusterId);
  for (const ref of refs) {
    if (!ref?.id || !ref?.type) continue;
    await addClusterMember(clusterId, { id: ref.id, type: ref.type });
  }
}

export async function removeClusterMember(clusterId, ref) {
  await assertClusterMutable(clusterId);
  await query(
    `DELETE FROM cluster_member
     WHERE cluster_id = $1 AND primitive_id = $2 AND primitive_type = $3`,
    [clusterId, ref.id, ref.type],
  );
}

export async function isWorkspaceCluster(clusterId) {
  const res = await query(
    'SELECT 1 FROM project_cluster WHERE cluster_id = $1 LIMIT 1',
    [clusterId],
  );
  return res.rows.length > 0;
}

async function archiveClusterRow(clusterId) {
  await query(
    `UPDATE cluster SET status = 'archived' WHERE id = $1`,
    [clusterId],
  );
  await query('DELETE FROM cluster_member WHERE cluster_id = $1', [clusterId]);
  await appendEvent({
    actor: { kind: 'human', id: 'user:local' },
    action: 'archived',
    targetId: clusterId,
    targetType: 'cluster',
    after: { status: 'archived' },
  });
}

/**
 * @param {string} clusterId
 * @param {{ name?: string, purpose?: string | null }} fields
 */
export async function updateCluster(clusterId, fields = {}) {
  const row = await getClusterById(clusterId);
  if (!row) throw new Error('cluster not found');
  const existing = await assertClusterMutable(clusterId);
  const name =
    fields.name !== undefined ? String(fields.name).trim() : undefined;
  if (name !== undefined && !name) throw new Error('name required');

  const purpose =
    fields.purpose !== undefined
      ? fields.purpose === null || fields.purpose === ''
        ? null
        : String(fields.purpose).trim()
      : undefined;

  if (name === undefined && purpose === undefined) {
    return existing;
  }

  const sets = [];
  const values = [];
  let i = 1;
  if (name !== undefined) {
    sets.push(`name = $${i++}`);
    values.push(name);
  }
  if (purpose !== undefined) {
    sets.push(`purpose = $${i++}`);
    values.push(purpose);
  }
  values.push(clusterId);

  await query(`UPDATE cluster SET ${sets.join(', ')} WHERE id = $${i}`, values);

  const after = { id: clusterId };
  if (name !== undefined) after.name = name;
  if (purpose !== undefined) after.purpose = purpose;

  await appendEvent({
    actor: { kind: 'human', id: 'user:local' },
    action: 'updated',
    targetId: clusterId,
    targetType: 'cluster',
    before: { name: existing.name, purpose: existing.purpose },
    after,
  });

  return getClusterById(clusterId);
}

/**
 * Soft-delete a sub-cluster: archive self, children, and clear membership rows.
 */
export async function archiveSubCluster(clusterId) {
  const cluster = await getClusterById(clusterId);
  if (!cluster) throw new Error('cluster not found');
  if (cluster.status === 'archived') return cluster;
  if (await isWorkspaceCluster(clusterId)) {
    throw new Error('cannot delete workspace cluster');
  }

  const children = await query(
    `SELECT id FROM cluster WHERE parent_cluster_id = $1 AND status != 'archived'`,
    [clusterId],
  );
  for (const row of children.rows) {
    await archiveSubCluster(row.id);
  }

  await archiveClusterRow(clusterId);
  return getClusterById(clusterId);
}

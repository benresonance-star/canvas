import { pool } from '../db.js';

const INDEX_ID = 'default';
export const ORPHAN_PURGE_CONFIRM_TOKEN = 'PURGE_ORPHAN_WORKSPACE_ITEMS';

const PRIMITIVE_DELETE_ORDER = ['relationship', 'assertion', 'note', 'task', 'artifact'];

function sampleRows(rows, limit) {
  return rows.slice(0, limit);
}

function rowsByPrimitiveType(rows) {
  const byType = new Map();
  for (const row of rows) {
    if (!row?.primitive_id || !row?.primitive_type) continue;
    if (!byType.has(row.primitive_type)) byType.set(row.primitive_type, []);
    byType.get(row.primitive_type).push(row.primitive_id);
  }
  return byType;
}

function countByPrimitiveType(rows) {
  const counts = {};
  for (const row of rows) {
    if (!row?.primitive_type) continue;
    counts[row.primitive_type] = (counts[row.primitive_type] ?? 0) + 1;
  }
  return counts;
}

export function projectIdsFromWorkspaceIndexPayload(payload) {
  return [
    ...new Set(
      (payload?.projects ?? [])
        .map((row) => row?.id)
        .filter((id) => typeof id === 'string' && id.trim()),
    ),
  ];
}

async function loadWorkspaceIndexPayload(client) {
  const result = await client.query(
    'SELECT payload FROM canvas_workspace_index WHERE id = $1',
    [INDEX_ID],
  );
  const payload = result.rows[0]?.payload ?? null;
  if (!payload) {
    throw new Error('workspace index not found; refusing orphan purge');
  }
  return payload;
}

async function collectKeepClusters(client, keepProjectIds) {
  if (!keepProjectIds.length) return [];
  const result = await client.query(
    `WITH RECURSIVE keep_clusters AS (
       SELECT c.id, c.parent_cluster_id, 0 AS depth
       FROM project_cluster pc
       INNER JOIN cluster c ON c.id = pc.cluster_id
       WHERE pc.project_id = ANY($1::text[])
       UNION ALL
       SELECT c.id, c.parent_cluster_id, keep_clusters.depth + 1 AS depth
       FROM cluster c
       INNER JOIN keep_clusters ON c.parent_cluster_id = keep_clusters.id
     )
     SELECT DISTINCT id, parent_cluster_id, depth
     FROM keep_clusters
     ORDER BY depth DESC, id`,
    [keepProjectIds],
  );
  return result.rows;
}

async function collectPurgeClusters(client, keepClusterIds) {
  const result = await client.query(
    `WITH RECURSIVE all_clusters AS (
       SELECT c.id, c.parent_cluster_id, 0 AS depth
       FROM cluster c
       WHERE c.parent_cluster_id IS NULL
       UNION ALL
       SELECT c.id, c.parent_cluster_id, all_clusters.depth + 1 AS depth
       FROM cluster c
       INNER JOIN all_clusters ON c.parent_cluster_id = all_clusters.id
     )
     SELECT c.id, c.parent_cluster_id, COALESCE(ac.depth, 0) AS depth
     FROM cluster c
     LEFT JOIN all_clusters ac ON ac.id = c.id
     WHERE NOT (c.id = ANY($1::text[]))
     ORDER BY COALESCE(ac.depth, 0) DESC, c.id`,
    [keepClusterIds],
  );
  return result.rows;
}

async function collectPurgeProjectClusters(client, keepProjectIds) {
  const result = await client.query(
    `SELECT project_id, cluster_id
     FROM project_cluster
     WHERE NOT (project_id = ANY($1::text[]))
     ORDER BY project_id`,
    [keepProjectIds],
  );
  return result.rows;
}

async function collectPurgeMemberships(client, purgeClusterIds) {
  if (!purgeClusterIds.length) return [];
  const result = await client.query(
    `SELECT cluster_id, primitive_id, primitive_type
     FROM cluster_member
     WHERE cluster_id = ANY($1::text[])
     ORDER BY cluster_id, primitive_type, primitive_id`,
    [purgeClusterIds],
  );
  return result.rows;
}

async function collectPurgePrimitives(client, keepClusterIds) {
  const result = await client.query(
    `WITH kept_refs AS (
       SELECT DISTINCT cm.primitive_id, cm.primitive_type
       FROM cluster_member cm
       WHERE cm.cluster_id = ANY($1::text[])
     ),
     candidate_relationship AS (
       SELECT r.id
       FROM relationship r
       WHERE NOT EXISTS (
         SELECT 1 FROM kept_refs kr
         WHERE kr.primitive_id = r.id AND kr.primitive_type = 'relationship'
       )
     ),
     candidate_assertion AS (
       SELECT a.id
       FROM assertion a
       WHERE NOT EXISTS (
         SELECT 1 FROM kept_refs kr
         WHERE kr.primitive_id = a.id AND kr.primitive_type = 'assertion'
       )
     ),
     candidate_note AS (
       SELECT n.id
       FROM note n
       WHERE NOT EXISTS (
         SELECT 1 FROM kept_refs kr
         WHERE kr.primitive_id = n.id AND kr.primitive_type = 'note'
       )
     ),
     candidate_task AS (
       SELECT t.id
       FROM task t
       WHERE NOT EXISTS (
         SELECT 1 FROM kept_refs kr
         WHERE kr.primitive_id = t.id AND kr.primitive_type = 'task'
       )
       AND (t.cluster_id IS NULL OR NOT (t.cluster_id = ANY($1::text[])))
     ),
     candidate_artifact AS (
       SELECT a.id
       FROM artifact a
       WHERE NOT EXISTS (
         SELECT 1 FROM kept_refs kr
         WHERE kr.primitive_id = a.id AND kr.primitive_type = 'artifact'
       )
       AND NOT EXISTS (
         SELECT 1 FROM relationship r
         WHERE ((r.from_id = a.id AND r.from_type = 'artifact')
             OR (r.to_id = a.id AND r.to_type = 'artifact'))
           AND NOT EXISTS (SELECT 1 FROM candidate_relationship cr WHERE cr.id = r.id)
       )
       AND NOT EXISTS (
         SELECT 1 FROM note n
         WHERE n.target_id = a.id AND n.target_type = 'artifact'
           AND NOT EXISTS (SELECT 1 FROM candidate_note cn WHERE cn.id = n.id)
       )
       AND NOT EXISTS (
         SELECT 1 FROM assertion s
         WHERE ((s.subject_id = a.id AND s.subject_type = 'artifact')
             OR (s.object_id = a.id AND s.object_type = 'artifact'))
           AND NOT EXISTS (SELECT 1 FROM candidate_assertion ca WHERE ca.id = s.id)
       )
       AND NOT EXISTS (
         SELECT 1 FROM task_io tio
         WHERE tio.primitive_id = a.id AND tio.primitive_type = 'artifact'
           AND NOT EXISTS (SELECT 1 FROM candidate_task ct WHERE ct.id = tio.task_id)
       )
       AND NOT EXISTS (
         SELECT 1 FROM provenance p
         WHERE p.source_id = a.id AND p.source_type = 'artifact'
           AND NOT (
             (p.primitive_type = 'relationship' AND EXISTS (
               SELECT 1 FROM candidate_relationship cr WHERE cr.id = p.primitive_id
             ))
             OR (p.primitive_type = 'assertion' AND EXISTS (
               SELECT 1 FROM candidate_assertion ca WHERE ca.id = p.primitive_id
             ))
             OR (p.primitive_type = 'note' AND EXISTS (
               SELECT 1 FROM candidate_note cn WHERE cn.id = p.primitive_id
             ))
             OR (p.primitive_type = 'task' AND EXISTS (
               SELECT 1 FROM candidate_task ct WHERE ct.id = p.primitive_id
             ))
           )
       )
     )
     SELECT id AS primitive_id, 'relationship' AS primitive_type FROM candidate_relationship
     UNION ALL
     SELECT id AS primitive_id, 'assertion' AS primitive_type FROM candidate_assertion
     UNION ALL
     SELECT id AS primitive_id, 'note' AS primitive_type FROM candidate_note
     UNION ALL
     SELECT id AS primitive_id, 'task' AS primitive_type FROM candidate_task
     UNION ALL
     SELECT id AS primitive_id, 'artifact' AS primitive_type FROM candidate_artifact
     ORDER BY primitive_type, primitive_id`,
    [keepClusterIds],
  );
  return result.rows;
}

async function collectPurgeEvents(client, purgeClusterIds, purgePrimitiveRows) {
  const primitiveIds = purgePrimitiveRows.map((row) => row.primitive_id);
  const primitiveTypes = purgePrimitiveRows.map((row) => row.primitive_type);
  const result = await client.query(
    `SELECT e.id, e.target_id, e.target_type, e.action, e.occurred_at
     FROM canvas_event e
     WHERE (e.target_type = 'cluster' AND e.target_id = ANY($1::text[]))
        OR EXISTS (
          SELECT 1
          FROM unnest($2::text[], $3::text[]) AS r(primitive_id, primitive_type)
          WHERE r.primitive_id = e.target_id
            AND r.primitive_type = e.target_type
        )
     ORDER BY e.occurred_at DESC, e.id`,
    [purgeClusterIds, primitiveIds, primitiveTypes],
  );
  return result.rows;
}

export async function collectOrphanWorkspacePurgePlan(client, { sampleLimit = 20 } = {}) {
  const workspaceIndex = await loadWorkspaceIndexPayload(client);
  const keepProjectIds = projectIdsFromWorkspaceIndexPayload(workspaceIndex);
  const keepClusters = await collectKeepClusters(client, keepProjectIds);
  const keepClusterIds = keepClusters.map((row) => row.id);
  const purgeClusters = await collectPurgeClusters(client, keepClusterIds);
  const purgeClusterIds = purgeClusters.map((row) => row.id);
  const purgeProjectClusters = await collectPurgeProjectClusters(client, keepProjectIds);
  const purgeMemberships = await collectPurgeMemberships(client, purgeClusterIds);
  const purgePrimitives = await collectPurgePrimitives(client, keepClusterIds);
  const purgeEvents = await collectPurgeEvents(client, purgeClusterIds, purgePrimitives);

  return {
    keep: {
      projectCount: keepProjectIds.length,
      projectIds: keepProjectIds,
      clusterCount: keepClusterIds.length,
      clusterIds: keepClusterIds,
    },
    purge: {
      projectClusterCount: purgeProjectClusters.length,
      clusterCount: purgeClusters.length,
      membershipCount: purgeMemberships.length,
      primitiveCount: purgePrimitives.length,
      primitiveCounts: countByPrimitiveType(purgePrimitives),
      eventCount: purgeEvents.length,
      samples: {
        projectClusters: sampleRows(purgeProjectClusters, sampleLimit),
        clusters: sampleRows(purgeClusters, sampleLimit),
        memberships: sampleRows(purgeMemberships, sampleLimit),
        primitives: sampleRows(purgePrimitives, sampleLimit),
        events: sampleRows(purgeEvents, sampleLimit),
      },
    },
    candidates: {
      projectClusters: purgeProjectClusters,
      clusters: purgeClusters,
      memberships: purgeMemberships,
      primitives: purgePrimitives,
      events: purgeEvents,
    },
  };
}

async function deleteByIds(client, sql, ids) {
  if (!ids.length) return 0;
  const result = await client.query(sql, [ids]);
  return result.rowCount ?? 0;
}

async function applyOrphanWorkspacePurgePlan(client, plan) {
  const purgeClusterIds = plan.candidates.clusters.map((row) => row.id);
  const purgeProjectIds = plan.candidates.projectClusters.map((row) => row.project_id);
  const purgeEventIds = plan.candidates.events.map((row) => row.id);
  const primitiveIdsByType = rowsByPrimitiveType(plan.candidates.primitives);
  const purgePrimitiveIds = plan.candidates.primitives.map((row) => row.primitive_id);
  const purgePrimitiveTypes = plan.candidates.primitives.map((row) => row.primitive_type);
  const taskIds = primitiveIdsByType.get('task') ?? [];

  const deleted = {};
  deleted.events = await deleteByIds(
    client,
    'DELETE FROM canvas_event WHERE id = ANY($1::text[])',
    purgeEventIds,
  );
  deleted.memberships = await deleteByIds(
    client,
    'DELETE FROM cluster_member WHERE cluster_id = ANY($1::text[])',
    purgeClusterIds,
  );

  if (purgePrimitiveIds.length) {
    await client.query(
      `DELETE FROM provenance
       WHERE EXISTS (
         SELECT 1
         FROM unnest($1::text[], $2::text[]) AS r(primitive_id, primitive_type)
         WHERE (r.primitive_id = provenance.primitive_id
            AND r.primitive_type = provenance.primitive_type)
            OR (r.primitive_id = provenance.source_id
            AND r.primitive_type = provenance.source_type)
       )`,
      [purgePrimitiveIds, purgePrimitiveTypes],
    );
    await client.query(
      `DELETE FROM task_io
       WHERE task_id = ANY($1::text[])
          OR EXISTS (
            SELECT 1
            FROM unnest($2::text[], $3::text[]) AS r(primitive_id, primitive_type)
            WHERE r.primitive_id = task_io.primitive_id
              AND r.primitive_type = task_io.primitive_type
          )`,
      [taskIds, purgePrimitiveIds, purgePrimitiveTypes],
    );
  }

  if (taskIds.length) {
    await client.query('UPDATE task SET parent_id = NULL WHERE parent_id = ANY($1::text[])', [taskIds]);
  }
  if (purgeClusterIds.length) {
    await client.query('UPDATE task SET cluster_id = NULL WHERE cluster_id = ANY($1::text[])', [purgeClusterIds]);
  }

  deleted.primitives = {};
  for (const type of PRIMITIVE_DELETE_ORDER) {
    const ids = primitiveIdsByType.get(type) ?? [];
    const table = type === 'relationship' ? 'relationship' : type;
    deleted.primitives[type] = await deleteByIds(
      client,
      `DELETE FROM ${table} WHERE id = ANY($1::text[])`,
      ids,
    );
  }

  deleted.projectClusters = await deleteByIds(
    client,
    'DELETE FROM project_cluster WHERE project_id = ANY($1::text[])',
    purgeProjectIds,
  );

  deleted.clusters = 0;
  for (const row of plan.candidates.clusters) {
    const result = await client.query('DELETE FROM cluster WHERE id = $1', [row.id]);
    deleted.clusters += result.rowCount ?? 0;
  }

  return deleted;
}

export async function runOrphanWorkspacePurge({
  apply = false,
  confirm = '',
  sampleLimit = 20,
  client = null,
} = {}) {
  if (apply && confirm !== ORPHAN_PURGE_CONFIRM_TOKEN) {
    throw new Error(`refusing to apply orphan purge without --confirm ${ORPHAN_PURGE_CONFIRM_TOKEN}`);
  }

  const ownClient = client ? null : await pool.connect();
  const db = client ?? ownClient;
  try {
    if (apply) await db.query('BEGIN');
    const plan = await collectOrphanWorkspacePurgePlan(db, { sampleLimit });
    const deleted = apply ? await applyOrphanWorkspacePurgePlan(db, plan) : null;
    if (apply) await db.query('COMMIT');
    return {
      dryRun: !apply,
      confirmToken: ORPHAN_PURGE_CONFIRM_TOKEN,
      ...plan,
      ...(deleted ? { deleted } : {}),
    };
  } catch (error) {
    if (apply) await db.query('ROLLBACK');
    throw error;
  } finally {
    if (ownClient) ownClient.release();
  }
}

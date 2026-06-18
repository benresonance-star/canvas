import { pool } from '../db.js';

function groupRefsByType(refs) {
  const byType = new Map();
  for (const ref of refs) {
    if (!ref?.primitive_id || !ref?.primitive_type) continue;
    if (!byType.has(ref.primitive_type)) byType.set(ref.primitive_type, []);
    byType.get(ref.primitive_type).push(ref.primitive_id);
  }
  return byType;
}

async function deleteRows(client, sql, ids) {
  if (!ids?.length) return 0;
  const result = await client.query(sql, [ids]);
  return result.rowCount ?? 0;
}

async function deleteOrphanArtifacts(client, ids) {
  if (!ids?.length) return 0;
  const result = await client.query(
    `DELETE FROM artifact a
     WHERE a.id = ANY($1::text[])
       AND NOT EXISTS (
         SELECT 1 FROM cluster_member cm
         WHERE cm.primitive_id = a.id AND cm.primitive_type = 'artifact'
       )
       AND NOT EXISTS (
         SELECT 1 FROM relationship r
         WHERE (r.from_id = a.id AND r.from_type = 'artifact')
            OR (r.to_id = a.id AND r.to_type = 'artifact')
       )
       AND NOT EXISTS (
         SELECT 1 FROM note n
         WHERE n.target_id = a.id AND n.target_type = 'artifact'
       )
       AND NOT EXISTS (
         SELECT 1 FROM assertion s
         WHERE (s.subject_id = a.id AND s.subject_type = 'artifact')
            OR (s.object_id = a.id AND s.object_type = 'artifact')
       )
       AND NOT EXISTS (
         SELECT 1 FROM provenance p
         WHERE p.source_id = a.id AND p.source_type = 'artifact'
       )
       AND NOT EXISTS (
         SELECT 1 FROM task_io tio
         WHERE tio.primitive_id = a.id AND tio.primitive_type = 'artifact'
       )`,
    [ids],
  );
  return result.rowCount ?? 0;
}

async function collectProjectClusterIds(client, projectId) {
  const result = await client.query(
    `WITH RECURSIVE cluster_tree AS (
       SELECT c.id, c.parent_cluster_id, 0 AS depth
       FROM project_cluster pc
       INNER JOIN cluster c ON c.id = pc.cluster_id
       WHERE pc.project_id = $1
       UNION ALL
       SELECT c.id, c.parent_cluster_id, cluster_tree.depth + 1 AS depth
       FROM cluster c
       INNER JOIN cluster_tree ON c.parent_cluster_id = cluster_tree.id
     )
     SELECT id, depth FROM cluster_tree ORDER BY depth DESC`,
    [projectId],
  );
  return result.rows;
}

async function collectClusterPrimitiveRefs(client, clusterIds) {
  if (!clusterIds.length) return [];
  const result = await client.query(
    `SELECT DISTINCT primitive_id, primitive_type
     FROM cluster_member
     WHERE cluster_id = ANY($1::text[])`,
    [clusterIds],
  );
  return result.rows;
}

async function collectOrphanPrimitiveRefs(client, refs) {
  if (!refs.length) return [];
  const ids = refs.map((ref) => ref.primitive_id);
  const types = refs.map((ref) => ref.primitive_type);
  const result = await client.query(
    `WITH candidates AS (
       SELECT * FROM unnest($1::text[], $2::text[]) AS r(primitive_id, primitive_type)
     )
     SELECT DISTINCT c.primitive_id, c.primitive_type
     FROM candidates c
     WHERE NOT EXISTS (
       SELECT 1 FROM cluster_member cm
       WHERE cm.primitive_id = c.primitive_id
         AND cm.primitive_type = c.primitive_type
     )`,
    [ids, types],
  );
  return result.rows;
}

async function deleteEventsForTargets(client, clusterIds, refs) {
  const refIds = refs.map((ref) => ref.primitive_id);
  const refTypes = refs.map((ref) => ref.primitive_type);
  const result = await client.query(
    `DELETE FROM canvas_event e
     WHERE (e.target_type = 'cluster' AND e.target_id = ANY($1::text[]))
        OR EXISTS (
          SELECT 1
          FROM unnest($2::text[], $3::text[]) AS r(primitive_id, primitive_type)
          WHERE r.primitive_id = e.target_id
            AND r.primitive_type = e.target_type
        )`,
    [clusterIds, refIds, refTypes],
  );
  return result.rowCount ?? 0;
}

async function deleteArtifactEventsForProject(client, projectId, artifactId, { orphaned = false } = {}) {
  const result = orphaned
    ? await client.query(
      `DELETE FROM canvas_event e
       WHERE e.target_type = 'artifact'
         AND e.target_id = $1`,
      [artifactId],
    )
    : await client.query(
      `DELETE FROM canvas_event e
       WHERE e.project_id = $1
         AND e.target_type = 'artifact'
         AND e.target_id = $2`,
      [projectId, artifactId],
    );
  return result.rowCount ?? 0;
}

async function deleteProjectArtifactRefWithClient(client, projectId, artifactId) {
  const clusterRows = await collectProjectClusterIds(client, projectId);
  const clusterIds = clusterRows.map((row) => row.id);
  if (!clusterIds.length || !artifactId) {
    return {
      clusterCount: clusterIds.length,
      membershipCount: 0,
      eventCount: 0,
      deletedArtifactCount: 0,
    };
  }

  const membershipDelete = await client.query(
    `DELETE FROM cluster_member
     WHERE cluster_id = ANY($1::text[])
       AND primitive_type = 'artifact'
       AND primitive_id = $2`,
    [clusterIds, artifactId],
  );

  const orphanRefs = await collectOrphanPrimitiveRefs(client, [{
    primitive_id: artifactId,
    primitive_type: 'artifact',
  }]);
  const artifactOrphaned = orphanRefs.some((ref) => ref.primitive_id === artifactId);
  const eventCount = await deleteArtifactEventsForProject(client, projectId, artifactId, {
    orphaned: artifactOrphaned,
  });
  const deletedArtifactCount = artifactOrphaned
    ? await deleteOrphanArtifacts(client, [artifactId])
    : 0;

  return {
    clusterCount: clusterIds.length,
    membershipCount: membershipDelete.rowCount ?? 0,
    eventCount,
    deletedArtifactCount,
  };
}

async function deleteProjectPrimitiveScopeWithClient(client, projectId) {
  const clusterRows = await collectProjectClusterIds(client, projectId);
  const clusterIds = clusterRows.map((row) => row.id);
  if (!clusterIds.length) {
    return {
      clusterCount: 0,
      primitiveMembershipCount: 0,
      orphanPrimitiveCount: 0,
      eventCount: 0,
      deletedPrimitiveCounts: {},
    };
  }

  const refs = await collectClusterPrimitiveRefs(client, clusterIds);
  const membershipDelete = await client.query(
    'DELETE FROM cluster_member WHERE cluster_id = ANY($1::text[])',
    [clusterIds],
  );
  const orphanRefs = await collectOrphanPrimitiveRefs(client, refs);
  const refsByType = groupRefsByType(orphanRefs);

  const eventCount = await deleteEventsForTargets(client, clusterIds, orphanRefs);

  const relationshipIds = refsByType.get('relationship') ?? [];
  const assertionIds = refsByType.get('assertion') ?? [];
  const noteIds = refsByType.get('note') ?? [];
  const taskIds = refsByType.get('task') ?? [];
  const artifactIds = refsByType.get('artifact') ?? [];

  await deleteRows(
    client,
    `DELETE FROM provenance
     WHERE primitive_type = 'relationship' AND primitive_id = ANY($1::text[])`,
    relationshipIds,
  );
  const deletedRelationships = await deleteRows(
    client,
    'DELETE FROM relationship WHERE id = ANY($1::text[])',
    relationshipIds,
  );

  await deleteRows(
    client,
    `DELETE FROM provenance
     WHERE primitive_type = 'assertion' AND primitive_id = ANY($1::text[])`,
    assertionIds,
  );
  const deletedAssertions = await deleteRows(
    client,
    'DELETE FROM assertion WHERE id = ANY($1::text[])',
    assertionIds,
  );

  await deleteRows(
    client,
    `DELETE FROM provenance
     WHERE primitive_type = 'note' AND primitive_id = ANY($1::text[])`,
    noteIds,
  );
  const deletedNotes = await deleteRows(
    client,
    'DELETE FROM note WHERE id = ANY($1::text[])',
    noteIds,
  );

  await deleteRows(client, 'DELETE FROM task_io WHERE task_id = ANY($1::text[])', taskIds);
  const deletedTasks = await deleteRows(client, 'DELETE FROM task WHERE id = ANY($1::text[])', taskIds);
  await client.query(
    `UPDATE task SET cluster_id = NULL
     WHERE cluster_id = ANY($1::text[])`,
    [clusterIds],
  );

  const deletedArtifacts = await deleteOrphanArtifacts(client, artifactIds);

  await client.query('DELETE FROM project_cluster WHERE project_id = $1', [projectId]);
  for (const row of clusterRows) {
    await client.query('DELETE FROM cluster WHERE id = $1', [row.id]);
  }

  return {
    clusterCount: clusterIds.length,
    primitiveMembershipCount: membershipDelete.rowCount ?? 0,
    orphanPrimitiveCount: orphanRefs.length,
    eventCount,
    deletedPrimitiveCounts: {
      artifact: deletedArtifacts,
      note: deletedNotes,
      relationship: deletedRelationships,
      assertion: deletedAssertions,
      task: deletedTasks,
    },
  };
}

export async function deleteProjectPrimitiveScope(projectId, client = null) {
  if (client) {
    return deleteProjectPrimitiveScopeWithClient(client, projectId);
  }

  const ownClient = await pool.connect();
  try {
    await ownClient.query('BEGIN');
    const result = await deleteProjectPrimitiveScopeWithClient(ownClient, projectId);
    await ownClient.query('COMMIT');
    return result;
  } catch (error) {
    await ownClient.query('ROLLBACK');
    throw error;
  } finally {
    ownClient.release();
  }
}

export async function deleteProjectArtifactRef(projectId, artifactId, client = null) {
  if (!projectId) throw new Error('projectId required');
  if (!artifactId) throw new Error('artifactId required');

  if (client) {
    return deleteProjectArtifactRefWithClient(client, projectId, artifactId);
  }

  const ownClient = await pool.connect();
  try {
    await ownClient.query('BEGIN');
    const result = await deleteProjectArtifactRefWithClient(ownClient, projectId, artifactId);
    await ownClient.query('COMMIT');
    return result;
  } catch (error) {
    await ownClient.query('ROLLBACK');
    throw error;
  } finally {
    ownClient.release();
  }
}

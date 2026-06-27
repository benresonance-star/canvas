import crypto from 'node:crypto';
import { pool } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import { validateFlowEdgeMetadata } from '../../src/features/flow/domain/flowDocument.js';
import { validateFlowLocalNodeTypeColors } from '../../src/features/flow/domain/flowLocalNodeTypeColors.js';

function flowHash(id) {
  return crypto.createHash('sha256').update(`canvas-flow:${id}`).digest('hex');
}

function mapNode(row) {
  return {
    id: row.id,
    type: row.kind,
    artifactId: row.artifact_id,
    position: { x: Number(row.position_x), y: Number(row.position_y) },
    width: row.width == null ? undefined : Number(row.width),
    height: row.height == null ? undefined : Number(row.height),
    data: {
      title: row.title,
      description: row.description,
      ...(row.presentation ?? {}),
    },
  };
}

function mapEdge(row) {
  const presentation = row.presentation ?? {};
  return {
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    sourceHandle: row.source_handle,
    targetHandle: row.target_handle,
    label: row.label,
    type: presentation.edgeType ?? 'smoothstep',
    data: presentation,
  };
}

async function loadFlowWith(client, id) {
  const document = await client.query(
    `SELECT id, project_id, title, description, viewport, revision, snapshot_path,
            local_node_type_colors, created_at, updated_at
     FROM flow_document WHERE id = $1`,
    [id],
  );
  if (!document.rows[0]) return null;
  const [nodes, edges] = await Promise.all([
    client.query('SELECT * FROM flow_node WHERE flow_id = $1 ORDER BY id', [id]),
    client.query('SELECT * FROM flow_edge WHERE flow_id = $1 ORDER BY id', [id]),
  ]);
  const row = document.rows[0];
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    viewport: row.viewport,
    revision: Number(row.revision),
    snapshotPath: row.snapshot_path,
    localNodeTypeColors: row.local_node_type_colors ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nodes: nodes.rows.map(mapNode),
    edges: edges.rows.map(mapEdge),
  };
}

export async function createFlow(projectId, { title, description = '' }) {
  const id = newUlid();
  const safeTitle = String(title ?? '').trim();
  if (!projectId || !safeTitle) throw new Error('projectId and title are required');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO artifact
       (id, type, uri, content_hash, version, source_authority, retrieved_at, payload_text, metadata)
       VALUES ($1, 'flow', $2, $3, '1', 'canvas.flow', NOW(), NULL, $4::jsonb)`,
      [id, `flow:${id}`, flowHash(id), JSON.stringify({ title: safeTitle, project_id: projectId })],
    );
    await client.query(
      `INSERT INTO flow_document (id, project_id, title, description)
       VALUES ($1, $2, $3, $4)`,
      [id, projectId, safeTitle, String(description ?? '')],
    );
    await client.query(
      `INSERT INTO cluster_member (cluster_id, primitive_id, primitive_type, added_at)
       SELECT cluster_id, $2, 'artifact', NOW()
       FROM project_cluster WHERE project_id = $1
       ON CONFLICT DO NOTHING`,
      [projectId, id],
    );
    await client.query('COMMIT');
    return loadFlowWith(client, id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Canvas cards can carry artifactRef ids before cluster membership is created.
 * Register referenced artifacts into the project workspace cluster (same as createFlow).
 */
async function ensureFlowArtifactClusterMembers(client, projectId, artifactIds) {
  const uniqueIds = [...new Set(artifactIds.filter(Boolean))];
  if (!uniqueIds.length) return;

  const existing = await client.query(
    'SELECT id FROM artifact WHERE id = ANY($1::text[])',
    [uniqueIds],
  );
  for (const row of existing.rows) {
    await client.query(
      `INSERT INTO cluster_member (cluster_id, primitive_id, primitive_type, added_at)
       SELECT cluster_id, $2, 'artifact', NOW()
       FROM project_cluster WHERE project_id = $1
       ON CONFLICT DO NOTHING`,
      [projectId, row.id],
    );
  }
}

export async function getFlow(id) {
  const client = await pool.connect();
  try {
    return loadFlowWith(client, id);
  } finally {
    client.release();
  }
}

function validateSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
    throw new Error('nodes and edges are required');
  }
  validateFlowLocalNodeTypeColors(snapshot.localNodeTypeColors);
  const ids = new Set();
  for (const node of snapshot.nodes) {
    if (!node?.id || ids.has(node.id)) throw new Error('flow node ids must be unique');
    if (!['artifact', 'local'].includes(node.type)) throw new Error('invalid flow node type');
    if (node.type === 'artifact' && !node.artifactId) throw new Error('artifact node requires artifactId');
    if (!Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) {
      throw new Error('flow node position is required');
    }
    ids.add(node.id);
  }
  for (const edge of snapshot.edges) {
    if (!edge?.id || !ids.has(edge.source) || !ids.has(edge.target)) {
      throw new Error('flow edge endpoints must reference nodes in the flow');
    }
    if (edge.source === edge.target) throw new Error('flow self-connections are not supported');
    validateFlowEdgeMetadata(edge);
  }
}

export async function replaceFlow(id, expectedRevision, snapshot) {
  validateSnapshot(snapshot);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const documentRow = await client.query('SELECT project_id FROM flow_document WHERE id = $1', [id]);
    if (!documentRow.rows[0]) {
      const error = new Error('flow not found');
      error.code = 'FLOW_NOT_FOUND';
      throw error;
    }
    const artifactIds = [...new Set(snapshot.nodes
      .filter((node) => node.type === 'artifact')
      .map((node) => node.artifactId))];
    const projectId = documentRow.rows[0].project_id;
    if (artifactIds.length) {
      await ensureFlowArtifactClusterMembers(client, projectId, artifactIds);
      const allowed = await client.query(
        `SELECT DISTINCT cm.primitive_id
         FROM cluster_member cm
         JOIN project_cluster pc ON pc.cluster_id = cm.cluster_id
         WHERE pc.project_id = $1 AND cm.primitive_type = 'artifact'
           AND cm.primitive_id = ANY($2::text[])`,
        [projectId, artifactIds],
      );
      if (allowed.rows.length !== artifactIds.length) {
        throw new Error('artifact nodes must reference artifacts in the same project');
      }
    }
    const updated = await client.query(
      `UPDATE flow_document
       SET title = $3, description = $4, viewport = $5::jsonb,
           snapshot_path = $6, local_node_type_colors = $7::jsonb,
           revision = revision + 1, updated_at = NOW()
       WHERE id = $1 AND revision = $2
       RETURNING revision`,
      [
        id,
        Number(expectedRevision),
        String(snapshot.title ?? '').trim(),
        String(snapshot.description ?? ''),
        JSON.stringify(snapshot.viewport ?? { x: 0, y: 0, zoom: 1 }),
        snapshot.snapshotPath ?? null,
        JSON.stringify(snapshot.localNodeTypeColors ?? {}),
      ],
    );
    if (!updated.rows[0]) {
      const current = await client.query('SELECT revision FROM flow_document WHERE id = $1', [id]);
      const error = new Error(current.rows[0] ? 'revision conflict' : 'flow not found');
      error.code = current.rows[0] ? 'FLOW_CONFLICT' : 'FLOW_NOT_FOUND';
      error.currentRevision = current.rows[0] ? Number(current.rows[0].revision) : null;
      throw error;
    }
    await client.query('DELETE FROM flow_edge WHERE flow_id = $1', [id]);
    await client.query('DELETE FROM flow_node WHERE flow_id = $1', [id]);
    for (const node of snapshot.nodes) {
      await client.query(
        `INSERT INTO flow_node
         (id, flow_id, kind, artifact_id, title, description, position_x, position_y,
          width, height, presentation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [
          node.id,
          id,
          node.type,
          node.type === 'artifact' ? node.artifactId : null,
          String(node.data?.title ?? ''),
          String(node.data?.description ?? ''),
          node.position.x,
          node.position.y,
          Number.isFinite(node.width) ? node.width : null,
          Number.isFinite(node.height) ? node.height : null,
          JSON.stringify(node.data ?? {}),
        ],
      );
    }
    for (const edge of snapshot.edges) {
      await client.query(
        `INSERT INTO flow_edge
         (id, flow_id, source_node_id, target_node_id, source_handle, target_handle, label, presentation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [edge.id, id, edge.source, edge.target, edge.sourceHandle ?? null,
          edge.targetHandle ?? null, String(edge.label ?? ''), JSON.stringify(edge.data ?? {})],
      );
    }
    await client.query(
      `UPDATE artifact
       SET metadata = metadata || $2::jsonb, retrieved_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify({ title: snapshot.title, flow_revision: Number(updated.rows[0].revision) })],
    );
    await client.query('COMMIT');
    return loadFlowWith(client, id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteFlow(id) {
  const result = await pool.query("DELETE FROM artifact WHERE id = $1 AND type = 'flow'", [id]);
  return result.rowCount > 0;
}

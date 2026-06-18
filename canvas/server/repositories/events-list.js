import { query } from '../db.js';

const WORKSPACE_CLUSTER_SCOPE_CTE = `WITH RECURSIVE workspace_projects AS (
  SELECT
    project_row->>'id' AS project_id,
    COALESCE(project_row->>'name', project_row->>'id') AS project_name,
    COALESCE((project_row->>'archived')::boolean, false) AS project_archived,
    project_ordinality AS project_order
  FROM canvas_workspace_index cwi
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(cwi.payload->'projects', '[]'::jsonb)
  ) WITH ORDINALITY AS project_entries(project_row, project_ordinality)
  WHERE cwi.id = 'default'
),
cluster_scope AS (
  SELECT
    wp.project_id,
    wp.project_name,
    wp.project_archived,
    wp.project_order,
    c.id
  FROM project_cluster pc
  INNER JOIN workspace_projects wp ON wp.project_id = pc.project_id
  INNER JOIN cluster c ON c.id = pc.cluster_id
  WHERE c.status != 'archived'
  UNION ALL
  SELECT
    parent.project_id,
    parent.project_name,
    parent.project_archived,
    parent.project_order,
    c.id
  FROM cluster c
  INNER JOIN cluster_scope parent ON c.parent_cluster_id = parent.id
  WHERE c.status != 'archived'
)`;

export async function listClusterEvents(clusterId, { limit = 200 } = {}) {
  const capped = Math.min(Math.max(1, Number(limit) || 200), 500);
  const result = await query(
    `SELECT e.id, e.action, e.target_id, e.target_type, e.occurred_at
     FROM canvas_event e
     INNER JOIN cluster_member cm
       ON cm.primitive_id = e.target_id AND cm.primitive_type = e.target_type
     WHERE cm.cluster_id = $1
     ORDER BY e.occurred_at DESC
     LIMIT $2`,
    [clusterId, capped],
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      action: row.action,
      target_id: row.target_id,
      target_type: row.target_type,
      occurred_at: row.occurred_at,
    })),
  };
}

export async function listWorkspaceEvents({ limit = 500 } = {}) {
  const capped = Math.min(Math.max(1, Number(limit) || 500), 1000);
  const result = await query(
    `${WORKSPACE_CLUSTER_SCOPE_CTE},
     visible_targets AS (
       SELECT DISTINCT
         cs.project_id,
         cs.project_name,
         cs.project_archived,
         cs.project_order,
         cm.primitive_id AS target_id,
         cm.primitive_type AS target_type
       FROM cluster_member cm
       INNER JOIN cluster_scope cs ON cs.id = cm.cluster_id
       UNION
       SELECT
         project_id,
         project_name,
         project_archived,
         project_order,
         id AS target_id,
         'cluster' AS target_type
       FROM cluster_scope
     ),
     scoped AS (
       SELECT DISTINCT ON (vt.project_id, e.id)
         vt.project_id, vt.project_name, vt.project_archived, vt.project_order,
         e.id, e.action, e.target_id, e.target_type, e.occurred_at
       FROM canvas_event e
       INNER JOIN visible_targets vt
         ON vt.target_id = e.target_id AND vt.target_type = e.target_type
       ORDER BY vt.project_id, e.id, e.occurred_at DESC
     )
     SELECT * FROM scoped
     ORDER BY project_order ASC, occurred_at DESC
     LIMIT $1`,
    [capped],
  );
  return {
    items: result.rows.map((row) => ({
      id: row.id,
      action: row.action,
      target_id: row.target_id,
      target_type: row.target_type,
      occurred_at: row.occurred_at,
      project_id: row.project_id,
      project_name: row.project_name,
      project_archived: row.project_archived,
      project_order: Number(row.project_order ?? 0),
    })),
  };
}

import { query } from '../db.js';

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

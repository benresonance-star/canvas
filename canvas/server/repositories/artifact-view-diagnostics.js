import { query } from '../db.js';

export async function recordArtifactViewDiagnostics(input, db = { query }) {
  const entries = Object.entries(input.counts ?? {})
    .filter(([, count]) => Number.isInteger(count) && count > 0);
  const rows = [];
  for (const [category, count] of entries) {
    const result = await db.query(
      `INSERT INTO artifact_view_diagnostic
         (project_id, mode, event_type, category, count, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, occurred_at`,
      [
        input.projectId,
        input.mode,
        input.eventType,
        category,
        count,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    rows.push(result.rows[0]);
  }
  return rows;
}

export async function summarizeArtifactViewDiagnostics(
  projectId,
  { hours = 24 } = {},
  db = { query },
) {
  const result = await db.query(
    `SELECT mode, event_type, category,
            SUM(count)::int AS count,
            MAX(occurred_at) AS last_seen_at
     FROM artifact_view_diagnostic
     WHERE project_id = $1
       AND occurred_at >= NOW() - ($2::text || ' hours')::interval
     GROUP BY mode, event_type, category
     ORDER BY mode, event_type, category`,
    [projectId, hours],
  );
  return result.rows.map((row) => ({
    mode: row.mode,
    eventType: row.event_type,
    category: row.category,
    count: Number(row.count),
    lastSeenAt: row.last_seen_at,
  }));
}

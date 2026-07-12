import { pool, query } from '../server/db.js';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const hours = Math.min(168, Math.max(1, Number(argument('hours', 24)) || 24));
const projectId = argument('project');
const strict = process.argv.includes('--strict');

try {
  const result = await query(
    `SELECT project_id, mode, event_type, category,
            SUM(count)::int AS count,
            MAX(occurred_at) AS last_seen_at
     FROM artifact_view_diagnostic
     WHERE occurred_at >= NOW() - ($1::text || ' hours')::interval
       AND ($2::text IS NULL OR project_id = $2)
     GROUP BY project_id, mode, event_type, category
     ORDER BY project_id, mode, event_type, category`,
    [hours, projectId],
  );

  console.log(`Artifact-view rollout diagnostics (${hours}h)`);
  if (result.rows.length === 0) console.log('No rollout diagnostics recorded.');
  for (const row of result.rows) {
    console.log([
      row.project_id,
      row.mode,
      row.event_type,
      row.category,
      Number(row.count),
      new Date(row.last_seen_at).toISOString(),
    ].join('\t'));
  }

  const failureCategories = new Set([
    'missing_view', 'identity_mismatch', 'surface_mismatch', 'geometry_mismatch',
    'duplicate_view', 'missing_legacy_card', 'version_mismatch', 'read_fallback',
  ]);
  const failures = result.rows.filter(
    (row) => failureCategories.has(row.category) && Number(row.count) > 0,
  );
  if (strict && (result.rows.length === 0 || failures.length > 0)) process.exitCode = 1;
} finally {
  await pool.end();
}

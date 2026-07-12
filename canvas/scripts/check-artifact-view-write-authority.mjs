import { pool } from '../server/db.js';

try {
  const result = await pool.query(
    `SELECT
       to_regprocedure('prepare_user_note_artifact_view_document(text,jsonb)') IS NOT NULL
         AS lifecycle_function,
       COUNT(*)::int AS projection_triggers
     FROM pg_trigger
     WHERE tgrelid = 'canvas_project_document'::regclass
       AND NOT tgisinternal
       AND tgname IN (
         'canvas_project_user_note_views',
         'zz_canvas_project_strip_user_note_geometry'
       )`,
  );
  const authority = result.rows[0] ?? null;
  console.log(JSON.stringify(authority, null, 2));
  if (process.argv.includes('--strict')
    && (!authority?.lifecycle_function || authority.projection_triggers !== 0)) {
    console.error('Artifact-view lifecycle authority is not fully explicit.');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}

import { pool } from '../server/db.js';

try {
  const result = await pool.query(
    `SELECT value, updated_at FROM canvas_runtime_setting
     WHERE key = 'artifact_view_write_authority'`,
  );
  const setting = result.rows[0] ?? null;
  console.log(JSON.stringify(setting, null, 2));
  if (process.argv.includes('--strict') && setting?.value !== 'verification') {
    console.error('Artifact-view write authority is not in verification mode.');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}

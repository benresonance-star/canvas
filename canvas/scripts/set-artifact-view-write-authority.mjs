import { pool } from '../server/db.js';

const requested = process.argv[2];
if (!['projection', 'verification'].includes(requested)) {
  console.error('Usage: node scripts/set-artifact-view-write-authority.mjs <projection|verification>');
  process.exitCode = 1;
} else {
  try {
    const result = await pool.query(
      `INSERT INTO canvas_runtime_setting (key, value, updated_at)
       VALUES ('artifact_view_write_authority', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING key, value, updated_at`,
      [requested],
    );
    console.log(JSON.stringify(result.rows[0], null, 2));
  } finally {
    await pool.end();
  }
}

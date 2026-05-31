import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Apply pending SQL migrations (tracked in schema_migrations).
 * @param {{ endPool?: boolean }} options - endPool: close pool when done (CLI)
 */
export async function runMigrations({ endPool = false } = {}) {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: countRows } = await client.query(
      'SELECT COUNT(*)::int AS n FROM schema_migrations',
    );
    if (countRows[0].n === 0) {
      const { rows: legacyRows } = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'artifact'
        ) AS exists
      `);
      if (legacyRows[0].exists) {
        for (const file of files) {
          if (file === '0003_artifact_audio_video.sql') continue;
          await client.query(
            'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
            [file],
          );
        }
        console.log('Legacy database detected; baselined prior migrations.');
      }
    }

    for (const file of files) {
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [file],
      );
      if (applied.rows.length > 0) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      console.log(`Migration ${file} applied.`);
    }
  } finally {
    client.release();
    if (endPool) await pool.end();
  }
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isCli) {
  runMigrations({ endPool: true }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

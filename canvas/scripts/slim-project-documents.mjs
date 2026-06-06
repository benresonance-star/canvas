import { pool } from '../server/db.js';
import { slimProjectPayloadForCache } from '../src/lib/projectSlim.js';

const dryRun = process.argv.includes('--dry-run');
const rows = (
  await pool.query('SELECT project_id, payload, revision FROM canvas_project_document')
).rows;
const now = new Date().toISOString();
const report = [];

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

for (const row of rows) {
  const before = JSON.stringify(row.payload ?? {}).length;
  const beforeCanonical = stableStringify(row.payload ?? {});
  const { serialised } = slimProjectPayloadForCache(row.payload ?? {});
  const after = serialised.length;
  const changed = beforeCanonical !== stableStringify(JSON.parse(serialised));
  if (changed && !dryRun) {
    await pool.query(
      `UPDATE canvas_project_document
       SET payload = $2::jsonb, updated_at = $3, revision = revision + 1
       WHERE project_id = $1`,
      [row.project_id, serialised, now],
    );
  }
  report.push({
    projectId: row.project_id,
    revision: Number(row.revision) || 0,
    changed,
    before,
    after,
    saved: before - after,
  });
}

console.log(JSON.stringify({ dryRun, projects: report }, null, 2));
await pool.end();

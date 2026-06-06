import { pool } from '../server/db.js';

const dryRun = process.argv.includes('--dry-run');
const indexRow = (
  await pool.query('SELECT payload FROM canvas_workspace_index WHERE id = $1', ['default'])
).rows[0];
const liveIds = new Set(
  (indexRow?.payload?.projects ?? [])
    .map((project) => project?.id)
    .filter(Boolean),
);
const docs = (
  await pool.query('SELECT project_id, payload, revision FROM canvas_project_document')
).rows;
const orphans = docs.filter((row) => !liveIds.has(row.project_id));

for (const row of orphans) {
  if (!dryRun) {
    await pool.query('DELETE FROM canvas_project_document WHERE project_id = $1', [
      row.project_id,
    ]);
  }
}

console.log(JSON.stringify({
  dryRun,
  liveIds: [...liveIds],
  deleted: dryRun ? 0 : orphans.length,
  orphans: orphans.map((row) => ({
    projectId: row.project_id,
    projectName: row.payload?.projectName ?? null,
    revision: Number(row.revision) || 0,
    bytes: JSON.stringify(row.payload ?? {}).length,
  })),
}, null, 2));

await pool.end();

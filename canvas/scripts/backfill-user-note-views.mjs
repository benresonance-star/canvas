import { pool } from '../server/db.js';
import { projectUserNoteViews } from '../server/domain/userNoteArtifactView.js';
import {
  archiveMissingArtifactViews,
  upsertArtifactViews,
} from '../server/repositories/artifact-views.js';

const apply = process.argv.includes('--apply');
const report = { mode: apply ? 'apply' : 'dry-run', projects: [], totals: { views: 0, unresolved: 0 } };

try {
  const documents = await pool.query(
    'SELECT project_id, payload FROM canvas_project_document ORDER BY project_id',
  );
  for (const row of documents.rows) {
    const allNotes = [row.payload?.cards ?? [], row.payload?.stagedSyncCards ?? []]
      .flat()
      .filter((entry) => entry?.type === 'user_note');
    const views = projectUserNoteViews(row.project_id, row.payload);
    const unresolved = allNotes.length - views.length;
    const item = { projectId: row.project_id, notes: allNotes.length, views: views.length, unresolved };
    report.projects.push(item);
    report.totals.views += views.length;
    report.totals.unresolved += unresolved;
    if (!apply) continue;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await upsertArtifactViews(row.project_id, views, client);
      await archiveMissingArtifactViews(row.project_id, views.map((view) => view.id), client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(`User-note view backfill failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

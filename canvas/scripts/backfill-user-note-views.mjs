import { pool } from '../server/db.js';
import { projectUserNoteViews } from '../server/domain/userNoteArtifactView.js';
import {
  archiveMissingArtifactViews,
  listArtifactViewsByProject,
  upsertArtifactViews,
} from '../server/repositories/artifact-views.js';

const apply = process.argv.includes('--apply');
const strict = process.argv.includes('--strict');
const report = {
  mode: apply ? 'apply' : 'dry-run',
  projects: [],
  totals: { views: 0, unresolved: 0, mismatches: 0 },
};

function mismatchCounts(expectedViews, storedViews) {
  const counts = {};
  const identity = (view) => `${view?.artifactId ?? ''}\0${view?.surface ?? ''}\0${view?.viewType ?? ''}`;
  const expected = new Map(expectedViews.map((view) => [identity(view), view]));
  const stored = new Map(storedViews.map((view) => [identity(view), view]));
  for (const [id, view] of expected) {
    const actual = stored.get(id);
    if (!actual) {
      counts.missing_view = (counts.missing_view ?? 0) + 1;
      continue;
    }
    if (['x', 'y', 'width', 'height', 'zIndex'].some(
      (field) => Number(view[field] ?? 0) !== Number(actual[field] ?? 0),
    )) counts.geometry_mismatch = (counts.geometry_mismatch ?? 0) + 1;
  }
  for (const id of stored.keys()) {
    if (!expected.has(id)) counts.missing_legacy_card = (counts.missing_legacy_card ?? 0) + 1;
  }
  return counts;
}

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
    const item = {
      projectId: row.project_id,
      notes: allNotes.length,
      views: views.length,
      unresolved,
      mismatches: {},
    };
    report.totals.views += views.length;
    report.totals.unresolved += unresolved;
    if (apply) {
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
    const storedViews = await listArtifactViewsByProject(row.project_id);
    item.mismatches = mismatchCounts(views, storedViews);
    report.totals.mismatches += Object.values(item.mismatches)
      .reduce((total, count) => total + count, 0);
    report.projects.push(item);
  }
  console.log(JSON.stringify(report, null, 2));
  if (strict && (report.totals.unresolved > 0 || report.totals.mismatches > 0)) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`User-note view backfill failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

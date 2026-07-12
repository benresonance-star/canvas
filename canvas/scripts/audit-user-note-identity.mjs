import { pool } from '../server/db.js';

function noteRows(projectId, payload) {
  const surfaces = [
    ['canvas', payload?.cards ?? []],
    ['dock', payload?.stagedSyncCards ?? []],
  ];

  return surfaces.flatMap(([surface, entries]) => entries
    .filter((entry) => entry?.type === 'user_note')
    .map((entry) => ({
      projectId,
      surface,
      cardId: entry.id ?? entry.stagingId ?? null,
      key: entry.key ?? null,
      artifactIds: [...new Set(
        (entry.versions ?? [])
          .map((version) => version?.artifactRef?.id)
          .filter(Boolean),
      )],
    })));
}

function classify(row, artifactProjectById) {
  if (row.artifactIds.length === 0) return 'missing_artifact_ref';
  if (row.artifactIds.length > 1) return 'multiple_artifact_refs';
  const artifactProjectId = artifactProjectById.get(row.artifactIds[0]);
  if (artifactProjectId === undefined) return 'missing_artifact';
  if (artifactProjectId && artifactProjectId !== row.projectId) return 'cross_project_artifact';
  return 'valid';
}

try {
  const documents = await pool.query(
    'SELECT project_id, payload FROM canvas_project_document ORDER BY project_id',
  );
  const notes = documents.rows.flatMap((row) => noteRows(row.project_id, row.payload));
  const artifactIds = [...new Set(notes.flatMap((note) => note.artifactIds))];
  const artifacts = artifactIds.length > 0
    ? await pool.query(
      'SELECT id, project_id FROM artifact WHERE id = ANY($1::text[])',
      [artifactIds],
    )
    : { rows: [] };
  const artifactProjectById = new Map(
    artifacts.rows.map((artifact) => [artifact.id, artifact.project_id]),
  );

  const classified = notes.map((note) => ({
    ...note,
    classification: classify(note, artifactProjectById),
  }));
  const counts = classified.reduce((result, note) => {
    result[note.classification] = (result[note.classification] ?? 0) + 1;
    return result;
  }, {});
  const byProject = documents.rows.map(({ project_id: projectId }) => {
    const projectNotes = classified.filter((note) => note.projectId === projectId);
    return {
      projectId,
      total: projectNotes.length,
      valid: projectNotes.filter((note) => note.classification === 'valid').length,
      unresolved: projectNotes.filter((note) => note.classification !== 'valid').length,
    };
  });

  console.log(JSON.stringify({
    documentCount: documents.rows.length,
    noteCount: classified.length,
    counts,
    byProject,
    unresolved: classified.filter((note) => note.classification !== 'valid'),
  }, null, 2));
} catch (error) {
  console.error(`User-note identity audit failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://canvas:canvas@localhost:5432/canvas',
});

try {
  const idx = await pool.query(
    'SELECT revision, updated_at, payload FROM canvas_workspace_index WHERE id = $1',
    ['default'],
  );
  const docs = await pool.query(
    `SELECT project_id, revision, updated_at,
            jsonb_array_length(COALESCE(payload->'cards', '[]'::jsonb)) AS canvas_cards
     FROM canvas_project_document
     ORDER BY updated_at DESC`,
  );
  console.log('=== canvas_workspace_index ===');
  if (idx.rows[0]) {
    const p = idx.rows[0].payload;
    console.log('revision:', idx.rows[0].revision);
    console.log('updated_at:', idx.rows[0].updated_at);
    console.log('activeProjectId:', p.activeProjectId);
    for (const row of p.projects ?? []) {
      console.log(
        ' -',
        row.id,
        '|',
        row.name,
        row.archived ? '(archived)' : '',
        row.syncState ? `[${row.syncState}]` : '',
      );
    }
  } else {
    console.log('(no index row)');
  }
  console.log('\n=== canvas_project_document ===');
  console.log('count:', docs.rows.length);
  for (const r of docs.rows) {
    console.log(
      r.project_id,
      '| rev',
      r.revision,
      '| cards',
      r.canvas_cards,
      '|',
      r.updated_at,
    );
  }
  const indexIds = new Set((idx.rows[0]?.payload?.projects ?? []).map((p) => p.id));
  const docOnly = docs.rows.filter((r) => !indexIds.has(r.project_id));
  const indexOnly = [...indexIds].filter(
    (id) => !docs.rows.some((r) => r.project_id === id),
  );
  if (docOnly.length) {
    console.log('\n=== in DB documents but NOT in index ===');
    docOnly.forEach((r) => console.log(' -', r.project_id));
  }
  if (indexOnly.length) {
    console.log('\n=== in index but NO document row ===');
    indexOnly.forEach((id) => console.log(' -', id));
  }
} catch (e) {
  console.error('DB error:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

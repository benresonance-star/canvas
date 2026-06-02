import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://canvas:canvas@localhost:5432/canvas',
});

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const docRes = await client.query('DELETE FROM canvas_project_document');
    const previewRes = await client.query(
      'DELETE FROM canvas_preview_blob WHERE project_id IS NOT NULL',
    ).catch(() => ({ rowCount: 0 }));
    const specRes = await client.query(
      'DELETE FROM spec_canvas_state',
    ).catch(() => ({ rowCount: 0 }));
    const agentRes = await client.query(
      'DELETE FROM canvas_agent_chat_session',
    ).catch(() => ({ rowCount: 0 }));
    const agentIdxRes = await client.query(
      'DELETE FROM canvas_agent_chat_thread_index',
    ).catch(() => ({ rowCount: 0 }));

    const emptyIndex = {
      version: 1,
      activeProjectId: null,
      projects: [],
    };

    const idxUpdate = await client.query(
      `UPDATE canvas_workspace_index
       SET payload = $1::jsonb,
           updated_at = NOW(),
           revision = COALESCE(revision, 0) + 1
       WHERE id = 'default'`,
      [JSON.stringify(emptyIndex)],
    );

    if (idxUpdate.rowCount === 0) {
      await client.query(
        `INSERT INTO canvas_workspace_index (id, payload, updated_at, revision)
         VALUES ('default', $1::jsonb, NOW(), 1)`,
        [JSON.stringify(emptyIndex)],
      );
    }

    await client.query('COMMIT');

    console.log('Workspace reset complete:');
    console.log('  canvas_project_document deleted:', docRes.rowCount);
    console.log('  canvas_preview_blob deleted:', previewRes.rowCount ?? 0);
    console.log('  spec_canvas_state deleted:', specRes.rowCount ?? 0);
    console.log('  canvas_agent_chat_session deleted:', agentRes.rowCount ?? 0);
    console.log('  canvas_agent_chat_thread_index deleted:', agentIdxRes.rowCount ?? 0);
    console.log('  canvas_workspace_index → empty projects[]');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
} catch (e) {
  console.error('Reset failed:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

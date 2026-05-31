import { query } from '../db.js';

export const LEGACY_THREAD_ID = 'legacy';

export async function getAgentChatThreadIndex(projectId, connectorId) {
  const res = await query(
    `SELECT payload, updated_at, revision FROM canvas_agent_chat_thread_index
     WHERE project_id = $1 AND connector_id = $2`,
    [projectId, connectorId],
  );
  if (!res.rows[0]) return null;
  return {
    payload: res.rows[0].payload,
    updatedAt: res.rows[0].updated_at,
    revision: Number(res.rows[0].revision) || 1,
  };
}

export async function putAgentChatThreadIndex(
  projectId,
  connectorId,
  index,
  expectedRevision = 0,
) {
  const expected = Number(expectedRevision);
  if (!Number.isFinite(expected) || expected < 0) {
    throw new Error('expectedRevision must be a non-negative number');
  }

  const existing = await query(
    `SELECT revision, payload, updated_at FROM canvas_agent_chat_thread_index
     WHERE project_id = $1 AND connector_id = $2`,
    [projectId, connectorId],
  );
  const now = new Date().toISOString();

  if (!existing.rows[0]) {
    if (expected > 0) {
      return {
        ok: false,
        conflict: true,
        revision: 0,
        payload: null,
        updatedAt: null,
      };
    }
    await query(
      `INSERT INTO canvas_agent_chat_thread_index
         (project_id, connector_id, payload, updated_at, revision)
       VALUES ($1, $2, $3::jsonb, $4, 1)`,
      [projectId, connectorId, JSON.stringify(index), now],
    );
    return { ok: true, revision: 1, updatedAt: now };
  }

  const currentRevision = Number(existing.rows[0].revision) || 1;
  if (expected !== currentRevision) {
    return {
      ok: false,
      conflict: true,
      revision: currentRevision,
      payload: existing.rows[0].payload,
      updatedAt: existing.rows[0].updated_at,
    };
  }

  const nextRevision = currentRevision + 1;
  await query(
    `UPDATE canvas_agent_chat_thread_index
     SET payload = $3::jsonb, updated_at = $4, revision = $5
     WHERE project_id = $1 AND connector_id = $2`,
    [projectId, connectorId, JSON.stringify(index), now, nextRevision],
  );
  return { ok: true, revision: nextRevision, updatedAt: now };
}

export async function getAgentChatSession(projectId, connectorId, threadId = LEGACY_THREAD_ID) {
  const res = await query(
    `SELECT payload, updated_at, revision FROM canvas_agent_chat_session
     WHERE project_id = $1 AND connector_id = $2 AND thread_id = $3`,
    [projectId, connectorId, threadId],
  );
  if (!res.rows[0]) return null;
  return {
    payload: res.rows[0].payload,
    updatedAt: res.rows[0].updated_at,
    revision: Number(res.rows[0].revision) || 1,
  };
}

export async function putAgentChatSession(
  projectId,
  connectorId,
  session,
  threadId,
  expectedRevision = 0,
) {
  const tid = threadId ?? session?.threadId ?? LEGACY_THREAD_ID;
  const expected = Number(expectedRevision);
  if (!Number.isFinite(expected) || expected < 0) {
    throw new Error('expectedRevision must be a non-negative number');
  }

  const existing = await query(
    `SELECT revision, payload, updated_at FROM canvas_agent_chat_session
     WHERE project_id = $1 AND connector_id = $2 AND thread_id = $3`,
    [projectId, connectorId, tid],
  );
  const now = new Date().toISOString();

  if (!existing.rows[0]) {
    if (expected > 0) {
      return {
        ok: false,
        conflict: true,
        revision: 0,
        payload: null,
        updatedAt: null,
      };
    }
    await query(
      `INSERT INTO canvas_agent_chat_session
         (project_id, connector_id, thread_id, payload, updated_at, revision)
       VALUES ($1, $2, $3, $4::jsonb, $5, 1)`,
      [projectId, connectorId, tid, JSON.stringify(session), now],
    );
    return { ok: true, revision: 1, updatedAt: now };
  }

  const currentRevision = Number(existing.rows[0].revision) || 1;
  if (expected !== currentRevision) {
    return {
      ok: false,
      conflict: true,
      revision: currentRevision,
      payload: existing.rows[0].payload,
      updatedAt: existing.rows[0].updated_at,
    };
  }

  const nextRevision = currentRevision + 1;
  await query(
    `UPDATE canvas_agent_chat_session
     SET payload = $4::jsonb, updated_at = $5, revision = $6
     WHERE project_id = $1 AND connector_id = $2 AND thread_id = $3`,
    [projectId, connectorId, tid, JSON.stringify(session), now, nextRevision],
  );
  return { ok: true, revision: nextRevision, updatedAt: now };
}

export async function deleteAgentChatSession(projectId, connectorId, threadId = LEGACY_THREAD_ID) {
  await query(
    'DELETE FROM canvas_agent_chat_session WHERE project_id = $1 AND connector_id = $2 AND thread_id = $3',
    [projectId, connectorId, threadId],
  );
}

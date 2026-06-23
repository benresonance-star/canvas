import crypto from 'node:crypto';
import { pool } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import {
  DEFAULT_LIVE_AGENT_PROMPT,
  validateLiveModel,
} from '../../src/features/live/domain/liveArtifact.js';
import { nextLiveRunAt } from '../lib/liveSchedule.js';

function identityHash(id) {
  return crypto.createHash('sha256').update(`canvas-live:${id}`).digest('hex');
}

function slug(value) {
  return String(value || 'live')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'live';
}

function mapLive(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    scheduleMode: row.schedule_mode,
    preferredTimeLocal: row.preferred_time_local,
    timezone: row.timezone,
    isActive: row.is_active,
    onlyUpdateIfMeaningful: row.only_update_if_meaningful,
    minimumChangeThreshold: Number(row.minimum_change_threshold),
    maxSourceChars: row.max_source_chars,
    provider: row.provider,
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    systemPrompt: row.system_prompt,
    currentVersionId: row.current_version_id,
    exportFilename: row.export_filename,
    folderExportStatus: row.folder_export_status,
    exportedVersionId: row.exported_version_id,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row) {
  if (!row) return null;
  return {
    id: row.id,
    liveArtifactId: row.live_artifact_id,
    versionNumber: row.version_number,
    title: row.title,
    reportDate: row.report_date_text || String(row.report_date),
    overview: row.overview,
    markdownBody: row.markdown_body,
    structured: row.structured_json,
    sourceLabel: row.source_label,
    provider: row.provider,
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapSource(row) {
  return {
    id: row.id,
    liveArtifactId: row.live_artifact_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    label: row.label,
    manualText: row.manual_text,
    isEnabled: row.is_enabled,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadLiveWith(client, id) {
  const result = await client.query('SELECT * FROM live_artifact WHERE id = $1', [id]);
  const live = mapLive(result.rows[0]);
  if (!live) return null;
  const version = live.currentVersionId
    ? await client.query(
      'SELECT *, report_date::text AS report_date_text FROM live_artifact_version WHERE id = $1',
      [live.currentVersionId],
    )
    : { rows: [] };
  return { ...live, latestVersion: mapVersion(version.rows[0]) };
}

export async function createLiveArtifact(projectId, input = {}) {
  const name = String(input.name || '').trim();
  if (!projectId || !name) throw new Error('projectId and name are required');
  const kind = input.kind || 'agent_feed';
  if (kind !== 'agent_feed') throw new Error('Unsupported live artifact kind');
  const provider = input.provider || 'openai';
  const model = input.model || 'gpt-4o-mini';
  const reasoningEffort = input.reasoningEffort || null;
  validateLiveModel(provider, model, reasoningEffort);
  const id = newUlid();
  const exportFilename = `live__${slug(name)}-${id.slice(-8).toLowerCase()}-v1.md`;
  const scheduleMode = input.scheduleMode || 'manual';
  const preferredTimeLocal = input.preferredTimeLocal || '08:00';
  const timezone = input.timezone || 'Australia/Melbourne';
  const isActive = input.isActive !== false;
  const nextRunAt = isActive
    ? nextLiveRunAt({ scheduleMode, preferredTimeLocal, timezone })
    : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO artifact
       (id, type, uri, content_hash, version, source_authority, retrieved_at, payload_text, metadata)
       VALUES ($1, 'live', $2, $3, '1', 'canvas.live', NOW(), NULL, $4::jsonb)`,
      [id, `canvas-live:${projectId}/${id}`, identityHash(id), JSON.stringify({
        name, project_id: projectId, live_kind: kind, export_filename: exportFilename,
      })],
    );
    await client.query(
      `INSERT INTO live_artifact
       (id, project_id, kind, name, description, schedule_mode, preferred_time_local,
        timezone, is_active, only_update_if_meaningful, minimum_change_threshold,
        max_source_chars, provider, model, reasoning_effort, system_prompt,
        export_filename, folder_export_status, next_run_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'not_configured',$18)`,
      [id, projectId, kind, name, String(input.description || ''), scheduleMode,
        preferredTimeLocal, timezone,
        isActive, input.onlyUpdateIfMeaningful !== false,
        input.minimumChangeThreshold ?? 0.25, input.maxSourceChars ?? 24000,
        provider, model, reasoningEffort, input.systemPrompt || DEFAULT_LIVE_AGENT_PROMPT,
        exportFilename, nextRunAt],
    );
    await client.query(
      `INSERT INTO live_artifact_source
       (id, live_artifact_id, source_type, label, sort_order)
       VALUES ($1, $2, 'previous_version', 'Previous version', 0)`,
      [newUlid(), id],
    );
    await client.query(
      `INSERT INTO cluster_member (cluster_id, primitive_id, primitive_type, added_at)
       SELECT cluster_id, $2, 'artifact', NOW() FROM project_cluster WHERE project_id = $1
       ON CONFLICT DO NOTHING`,
      [projectId, id],
    );
    await client.query('COMMIT');
    return loadLiveWith(client, id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listLiveArtifacts(projectId) {
  const result = await pool.query(
    'SELECT * FROM live_artifact WHERE project_id = $1 ORDER BY created_at',
    [projectId],
  );
  return Promise.all(result.rows.map(async (row) => loadLiveWith(pool, row.id)));
}

export async function getLiveArtifact(id) {
  return loadLiveWith(pool, id);
}

export async function updateLiveArtifact(id, patch = {}) {
  const current = await getLiveArtifact(id);
  if (!current) return null;
  const provider = patch.provider ?? current.provider;
  const model = patch.model ?? current.model;
  const reasoningEffort = patch.reasoningEffort !== undefined
    ? patch.reasoningEffort || null
    : current.reasoningEffort;
  validateLiveModel(provider, model, reasoningEffort);
  const values = {
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    scheduleMode: patch.scheduleMode ?? current.scheduleMode,
    preferredTimeLocal: patch.preferredTimeLocal ?? current.preferredTimeLocal,
    timezone: patch.timezone ?? current.timezone,
    isActive: patch.isActive ?? current.isActive,
    onlyUpdateIfMeaningful: patch.onlyUpdateIfMeaningful ?? current.onlyUpdateIfMeaningful,
    minimumChangeThreshold: patch.minimumChangeThreshold ?? current.minimumChangeThreshold,
    maxSourceChars: patch.maxSourceChars ?? current.maxSourceChars,
    provider, model, reasoningEffort,
    systemPrompt: patch.systemPrompt ?? current.systemPrompt,
  };
  if (!['manual', 'daily', 'weekly'].includes(values.scheduleMode)) {
    throw new Error('Invalid schedule mode');
  }
  if (values.minimumChangeThreshold < 0 || values.minimumChangeThreshold > 1) {
    throw new Error('Minimum change threshold must be between 0 and 1');
  }
  if (values.maxSourceChars < 1000 || values.maxSourceChars > 200000) {
    throw new Error('Max source chars must be between 1000 and 200000');
  }
  const nextRunAt = values.isActive
    ? nextLiveRunAt(values)
    : null;
  await pool.query(
    `UPDATE live_artifact SET name=$2, description=$3, schedule_mode=$4,
     preferred_time_local=$5, timezone=$6, is_active=$7,
     only_update_if_meaningful=$8, minimum_change_threshold=$9, max_source_chars=$10,
     provider=$11, model=$12, reasoning_effort=$13, system_prompt=$14,
     next_run_at=$15, updated_at=NOW()
     WHERE id=$1`,
    [id, values.name, values.description, values.scheduleMode, values.preferredTimeLocal,
      values.timezone, values.isActive, values.onlyUpdateIfMeaningful,
      values.minimumChangeThreshold, values.maxSourceChars, values.provider, values.model,
      values.reasoningEffort, values.systemPrompt, nextRunAt],
  );
  return getLiveArtifact(id);
}

export async function listLiveSources(id) {
  const result = await pool.query(
    'SELECT * FROM live_artifact_source WHERE live_artifact_id=$1 ORDER BY sort_order, created_at',
    [id],
  );
  return result.rows.map(mapSource);
}

export async function addLiveSource(id, input = {}) {
  const sourceType = input.sourceType || 'manual_text';
  const allowed = ['previous_version', 'manual_text', 'canvas_artifact', 'canvas_note', 'project_assumptions'];
  if (!allowed.includes(sourceType)) throw new Error('Invalid live source type');
  const sourceId = newUlid();
  const result = await pool.query(
    `INSERT INTO live_artifact_source
     (id, live_artifact_id, source_type, source_id, label, manual_text, is_enabled, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [sourceId, id, sourceType, input.sourceId || null, String(input.label || 'Source'),
      input.manualText || null, input.isEnabled !== false, input.sortOrder ?? 0],
  );
  return mapSource(result.rows[0]);
}

export async function updateLiveSource(sourceId, patch = {}) {
  const result = await pool.query(
    `UPDATE live_artifact_source SET
     label=COALESCE($2,label), manual_text=CASE WHEN $3::boolean THEN $4 ELSE manual_text END,
     is_enabled=COALESCE($5,is_enabled), sort_order=COALESCE($6,sort_order), updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [sourceId, patch.label ?? null, patch.manualText !== undefined, patch.manualText ?? null,
      patch.isEnabled ?? null, patch.sortOrder ?? null],
  );
  return result.rows[0] ? mapSource(result.rows[0]) : null;
}

export async function deleteLiveSource(sourceId) {
  const result = await pool.query(
    "DELETE FROM live_artifact_source WHERE id=$1 AND source_type <> 'previous_version'",
    [sourceId],
  );
  return result.rowCount > 0;
}

export async function listLiveHistory(id, limit = 100) {
  const result = await pool.query(
    `SELECT *, report_date::text AS report_date_text FROM live_artifact_version WHERE live_artifact_id=$1
     ORDER BY version_number DESC LIMIT $2`,
    [id, Math.max(1, Math.min(Number(limit) || 100, 500))],
  );
  return result.rows.map(mapVersion);
}

export async function buildLiveSourceContext(live) {
  const sources = (await listLiveSources(live.id)).filter((source) => source.isEnabled);
  const parts = [];
  for (const source of sources) {
    let text = '';
    if (source.sourceType === 'previous_version') {
      text = live.latestVersion?.markdownBody || '';
    } else if (source.sourceType === 'manual_text' || source.sourceType === 'project_assumptions') {
      text = source.manualText || '';
    } else if (source.sourceType === 'canvas_artifact' && source.sourceId) {
      const row = await pool.query('SELECT payload_text FROM artifact WHERE id=$1', [source.sourceId]);
      text = row.rows[0]?.payload_text || '';
    } else if (source.sourceType === 'canvas_note' && source.sourceId) {
      const row = await pool.query('SELECT body FROM note WHERE id=$1', [source.sourceId]);
      text = row.rows[0]?.body || '';
    }
    if (text.trim()) parts.push(`SOURCE — ${source.label}\n${text.trim()}`);
  }
  return parts.join('\n\n').slice(0, live.maxSourceChars);
}

export async function startLiveRun(live, triggerType) {
  const id = newUlid();
  await pool.query(
    `INSERT INTO live_artifact_run
     (id, live_artifact_id, status, trigger_type, provider, model, reasoning_effort)
     VALUES ($1,$2,'running',$3,$4,$5,$6)`,
    [id, live.id, triggerType, live.provider, live.model, live.reasoningEffort],
  );
  return id;
}

export async function finishLiveRunSkipped(runId, changeScore, rawResponse) {
  await pool.query(
    `UPDATE live_artifact_run SET status='skipped_no_meaningful_change', finished_at=NOW(),
     change_score=$2, raw_response=$3::jsonb WHERE id=$1`,
    [runId, changeScore, JSON.stringify(rawResponse)],
  );
}

export async function finishLiveRunFailed(runId, errorMessage) {
  await pool.query(
    `UPDATE live_artifact_run SET status='failed', finished_at=NOW(), error_message=$2 WHERE id=$1`,
    [runId, String(errorMessage).slice(0, 2000)],
  );
}

export async function finishLiveRunSuccess({ live, runId, output, contextLength }) {
  const client = await pool.connect();
  const versionId = newUlid();
  const updateId = newUlid();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM live_artifact WHERE id=$1 FOR UPDATE', [live.id]);
    const next = await client.query(
      `SELECT COALESCE(MAX(version_number),0)+1 AS n
       FROM live_artifact_version WHERE live_artifact_id=$1`,
      [live.id],
    );
    const versionNumber = Number(next.rows[0].n);
    await client.query(
      `INSERT INTO live_artifact_version
       (id, live_artifact_id, version_number, title, report_date, overview, markdown_body,
        structured_json, source_label, provider, model, reasoning_effort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)`,
      [versionId, live.id, versionNumber, output.title, output.reportDate, output.overview,
        output.markdownBody, JSON.stringify(output), 'Enabled live sources', live.provider,
        live.model, live.reasoningEffort],
    );
    await client.query(
      `UPDATE live_artifact SET current_version_id=$2, last_run_at=NOW(),
       folder_export_status='pending', updated_at=NOW() WHERE id=$1`,
      [live.id, versionId],
    );
    await client.query(
      `UPDATE artifact SET retrieved_at=NOW(), metadata=metadata || $2::jsonb WHERE id=$1`,
      [live.id, JSON.stringify({ current_version_id: versionId, version_number: versionNumber })],
    );
    await client.query(
      `INSERT INTO project_update_event
       (id, project_id, artifact_id, version_id, live_artifact_id, event_type, title, body)
       VALUES ($1,$2,$3,$4,$3,'live_updated',$5,$6)`,
      [updateId, live.projectId, live.id, versionId, `${live.name} updated`, output.overview],
    );
    await client.query(
      `UPDATE live_artifact_run SET status='succeeded', finished_at=NOW(),
       source_char_count=$2, output_char_count=$3, created_version_id=$4,
       change_score=$5, raw_response=$6::jsonb WHERE id=$1`,
      [runId, contextLength, output.markdownBody.length, versionId, output.changeScore,
        JSON.stringify(output)],
    );
    await client.query('COMMIT');
    return { versionId, versionNumber, updateId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listProjectUpdates(projectId, { unreadOnly = false, limit = 20 } = {}) {
  const result = await pool.query(
    `SELECT * FROM project_update_event WHERE project_id=$1
     AND ($2::boolean = FALSE OR is_read = FALSE)
     ORDER BY created_at DESC LIMIT $3`,
    [projectId, unreadOnly, Math.max(1, Math.min(Number(limit) || 20, 100))],
  );
  return result.rows.map((row) => ({
    id: row.id, projectId: row.project_id, artifactId: row.artifact_id,
    versionId: row.version_id, liveArtifactId: row.live_artifact_id,
    eventType: row.event_type, title: row.title, body: row.body,
    isRead: row.is_read, createdAt: row.created_at,
  }));
}

export async function markProjectUpdateRead(id) {
  const result = await pool.query(
    'UPDATE project_update_event SET is_read=TRUE WHERE id=$1 RETURNING id', [id],
  );
  return result.rowCount > 0;
}

export async function markAllProjectUpdatesRead(projectId) {
  const result = await pool.query(
    'UPDATE project_update_event SET is_read=TRUE WHERE project_id=$1 AND is_read=FALSE',
    [projectId],
  );
  return result.rowCount;
}

export async function markLiveExported(id, versionId) {
  const result = await pool.query(
    `UPDATE live_artifact SET folder_export_status='exported', exported_version_id=$2,
     updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id, versionId],
  );
  return result.rows[0] ? mapLive(result.rows[0]) : null;
}

export async function claimDueLiveArtifacts(limit = 10) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id FROM live_artifact
       WHERE is_active=TRUE AND schedule_mode <> 'manual' AND next_run_at <= NOW()
       ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT $1`,
      [Math.max(1, Math.min(Number(limit) || 10, 50))],
    );
    const ids = result.rows.map((row) => row.id);
    if (ids.length) {
      await client.query(
        `UPDATE live_artifact SET next_run_at=NOW() + INTERVAL '15 minutes'
         WHERE id=ANY($1::text[])`,
        [ids],
      );
    }
    await client.query('COMMIT');
    return ids;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function scheduleNextLiveRun(id) {
  const live = await getLiveArtifact(id);
  if (!live) return null;
  const nextRunAt = live.isActive ? nextLiveRunAt(live) : null;
  await pool.query('UPDATE live_artifact SET next_run_at=$2 WHERE id=$1', [id, nextRunAt]);
  return nextRunAt;
}

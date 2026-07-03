import crypto from 'node:crypto';
import { pool } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';

function artifactHash(prefix, id) {
  return crypto.createHash('sha256').update(`${prefix}:${id}`).digest('hex');
}

function mapStudio(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? '',
    studioKind: row.studio_kind,
    playbookId: row.playbook_id ?? null,
    parentStudioId: row.parent_studio_id ?? null,
    parentArtifactId: row.parent_artifact_id ?? null,
    state: row.state,
    primarySurfaceId: row.primary_surface_id ?? null,
    briefArtifactId: row.brief_artifact_id ?? null,
    teamConfig: row.team_config ?? [],
    settings: row.settings ?? {},
    summary: row.summary ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSurface(row) {
  if (!row) return null;
  return {
    id: row.id,
    studioId: row.studio_id,
    projectId: row.project_id,
    artifactId: row.artifact_id,
    surfaceType: row.surface_type,
    title: row.title,
    purpose: row.purpose ?? '',
    isPrimary: row.is_primary === true,
    flow: row.flow_id ? {
      id: row.flow_id,
      title: row.flow_title,
      description: row.flow_description ?? '',
      snapshotPath: row.flow_snapshot_path ?? null,
      revision: Number(row.flow_revision ?? 1),
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlaybook(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    studioKind: row.studio_kind,
    description: row.description ?? '',
    recommendedRoles: row.recommended_roles ?? [],
    suggestedSteps: row.suggested_steps ?? [],
    defaultOutputTypes: row.default_output_types ?? [],
    reviewGates: row.review_gates ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStudioStep(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id ?? null,
    studioId: row.studio_id,
    projectId: row.project_id,
    title: row.title,
    performerKind: row.performer_kind,
    performerRef: row.performer_ref ?? null,
    goal: row.goal ?? '',
    inputArtifactIds: row.input_artifact_ids ?? [],
    outputArtifactIds: row.output_artifact_ids ?? [],
    status: row.status,
    childStudioId: row.child_studio_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContextPacket(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceStudioId: row.source_studio_id,
    targetStudioId: row.target_studio_id ?? null,
    projectId: row.project_id,
    title: row.title,
    focalQuestion: row.focal_question ?? '',
    artifactIds: row.artifact_ids ?? [],
    summary: row.summary ?? '',
    constraints: row.constraints ?? [],
    expectedOutputs: row.expected_outputs ?? [],
    createdAt: row.created_at,
  };
}

function mapCandidate(row) {
  if (!row) return null;
  return {
    id: row.id,
    studioId: row.studio_id,
    projectId: row.project_id,
    underlyingArtifactId: row.underlying_artifact_id,
    status: row.status,
    provenanceRunId: row.provenance_run_id ?? null,
    provenanceStepId: row.provenance_step_id ?? null,
    notes: row.notes ?? '',
    artifactTitle: row.artifact_title ?? null,
    artifactType: row.artifact_type ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPromotion(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceStudioId: row.source_studio_id,
    targetStudioId: row.target_studio_id ?? null,
    targetArtifactId: row.target_artifact_id ?? null,
    projectId: row.project_id,
    candidateArtifactId: row.candidate_artifact_id,
    action: row.action,
    status: row.status,
    rationale: row.rationale ?? '',
    approvedBy: row.approved_by ?? null,
    candidateTitle: row.candidate_title ?? null,
    candidateUnderlyingArtifactId: row.candidate_underlying_artifact_id ?? null,
    createdAt: row.created_at,
    appliedAt: row.applied_at ?? null,
  };
}

async function appendStudioEvent(client, {
  artifactId,
  projectId,
  type,
  payload = {},
  actorType = 'system',
  actorId = 'system:studio',
}) {
  await client.query(
    `INSERT INTO artifact_event
     (id, artifact_id, project_id, type, payload, actor_type, actor_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [newUlid(), artifactId, projectId, type, JSON.stringify(payload), actorType, actorId],
  );
}

async function removeChildStudioNodeFromParentFlowInTx(client, parentStudioId, childStudioId) {
  const surfaceResult = await client.query(
    `SELECT artifact_id
     FROM studio_surface
     WHERE studio_id = $1 AND is_primary = true
     LIMIT 1`,
    [parentStudioId],
  );
  const flowId = surfaceResult.rows[0]?.artifact_id;
  if (!flowId) return false;

  const nodeResult = await client.query(
    `SELECT id FROM flow_node WHERE flow_id = $1 AND artifact_id = $2`,
    [flowId, childStudioId],
  );
  const nodeIds = nodeResult.rows.map((row) => row.id);
  if (!nodeIds.length) return false;

  await client.query(
    `DELETE FROM flow_edge
     WHERE flow_id = $1
       AND (source_node_id = ANY($2::text[]) OR target_node_id = ANY($2::text[]))`,
    [flowId, nodeIds],
  );
  await client.query(
    `DELETE FROM flow_node WHERE flow_id = $1 AND artifact_id = $2`,
    [flowId, childStudioId],
  );
  await client.query(
    `UPDATE flow_document SET updated_at = NOW(), revision = revision + 1 WHERE id = $1`,
    [flowId],
  );
  return true;
}

async function ensureChildStudioNodeInParentFlowInTx(client, parentStudioId, childStudioId, childTitle) {
  const surfaceResult = await client.query(
    `SELECT artifact_id
     FROM studio_surface
     WHERE studio_id = $1 AND is_primary = true
     LIMIT 1`,
    [parentStudioId],
  );
  const flowId = surfaceResult.rows[0]?.artifact_id;
  if (!flowId) return false;

  const existing = await client.query(
    `SELECT id FROM flow_node WHERE flow_id = $1 AND artifact_id = $2`,
    [flowId, childStudioId],
  );
  if (existing.rows.length) return false;

  const safeTitle = String(childTitle ?? '').trim() || 'Child Studio';
  await client.query(
    `INSERT INTO flow_node
     (id, flow_id, kind, artifact_id, title, description, position_x, position_y, presentation)
     VALUES ($1, $2, 'artifact', $3, $4, $5, 120, 80, $6::jsonb)`,
    [
      newUlid(),
      flowId,
      childStudioId,
      safeTitle,
      'Child Studio',
      JSON.stringify({
        artifactType: 'studio',
        artifactId: childStudioId,
        title: safeTitle,
        displayFilename: safeTitle,
        description: 'Child Studio',
      }),
    ],
  );
  await client.query(
    `UPDATE flow_document SET updated_at = NOW(), revision = revision + 1 WHERE id = $1`,
    [flowId],
  );
  return true;
}

async function createStudioRecordInTx(client, input, { id = newUlid(), createdBy = 'user' } = {}) {
  const projectId = input.projectId;
  const title = String(input.title ?? '').trim();
  if (!projectId || !title) throw new Error('projectId and title are required');
  const studioKind = input.studioKind ?? input.studio_kind ?? 'domain';
  const playbookId = input.playbookId ?? input.playbook_id ?? 'builtin_generic_domain_studio';
  const playbook = await getStudioPlaybookById(playbookId, client);
  if (!playbook) throw new Error('studio playbook not found');
  await client.query(
    `INSERT INTO artifact
     (id, type, uri, content_hash, version, source_authority, retrieved_at,
      payload_text, metadata, project_id, title, description, capabilities,
      created_by, updated_by, created_at, updated_at, schema_version)
     VALUES ($1, 'studio', $2, $3, '1', 'canvas.studio', NOW(), NULL,
      $4::jsonb, $5, $6, $7, $8::text[], $9, $9, NOW(), NOW(), 1)`,
    [
      id,
      `studio:${id}`,
      artifactHash('canvas-studio', id),
      JSON.stringify({ title, project_id: projectId, studio_kind: studioKind, playbook_id: playbookId }),
      projectId,
      title,
      String(input.description ?? ''),
      ['canHaveState', 'canContain', 'canReference', 'canRun', 'canReview'],
      createdBy,
    ],
  );
  await client.query(
    `INSERT INTO studio
     (id, project_id, title, description, studio_kind, playbook_id,
      parent_studio_id, parent_artifact_id, state, team_config, settings, summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)`,
    [
      id,
      projectId,
      title,
      String(input.description ?? ''),
      studioKind,
      playbookId,
      input.parentStudioId ?? input.parent_studio_id ?? null,
      input.parentArtifactId ?? input.parent_artifact_id ?? null,
      input.state ?? 'seeded',
      JSON.stringify(input.teamConfig ?? input.team_config ?? playbook.recommendedRoles ?? []),
      JSON.stringify(input.settings ?? {}),
      String(input.summary ?? ''),
    ],
  );
  await ensureClusterMember(client, projectId, id);
  return { id, projectId, title, studioKind, playbookId, playbook };
}

async function ensureClusterMember(client, projectId, artifactId) {
  await client.query(
    `INSERT INTO cluster_member (cluster_id, primitive_id, primitive_type, added_at)
     SELECT cluster_id, $2, 'artifact', NOW()
     FROM project_cluster WHERE project_id = $1
     ON CONFLICT DO NOTHING`,
    [projectId, artifactId],
  );
}

async function createFlowDocumentInTx(client, projectId, { title, description = '' }) {
  const id = newUlid();
  const safeTitle = String(title ?? '').trim() || 'Studio Exploration';
  await client.query(
    `INSERT INTO artifact
     (id, type, uri, content_hash, version, source_authority, retrieved_at,
      payload_text, metadata, project_id, title, description, capabilities,
      created_by, updated_by, created_at, updated_at)
     VALUES ($1, 'flow', $2, $3, '1', 'canvas.studio', NOW(), NULL, $4::jsonb,
       $5, $6, $7, $8::text[], $9, $9, NOW(), NOW())`,
    [
      id,
      `flow:${id}`,
      artifactHash('canvas-flow', id),
      JSON.stringify({ title: safeTitle, project_id: projectId, studio_created: true }),
      projectId,
      safeTitle,
      String(description ?? ''),
      ['canHaveState', 'canContain', 'canReference'],
      'system:studio',
    ],
  );
  await client.query(
    `INSERT INTO flow_document (id, project_id, title, description)
     VALUES ($1, $2, $3, $4)`,
    [id, projectId, safeTitle, String(description ?? '')],
  );
  await ensureClusterMember(client, projectId, id);
  return {
    id,
    projectId,
    title: safeTitle,
    description: String(description ?? ''),
    revision: 1,
    snapshotPath: null,
    nodes: [],
    edges: [],
    paths: [],
  };
}

async function createSurfaceInTx(client, {
  studioId,
  projectId,
  artifactId,
  surfaceType = 'exploration',
  title,
  purpose = '',
  isPrimary = false,
}) {
  const id = newUlid();
  if (isPrimary) {
    await client.query('UPDATE studio_surface SET is_primary = FALSE WHERE studio_id = $1', [studioId]);
  }
  const inserted = await client.query(
    `INSERT INTO studio_surface
     (id, studio_id, artifact_id, project_id, surface_type, title, purpose, is_primary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [id, studioId, artifactId, projectId, surfaceType, String(title ?? 'Studio Surface'), String(purpose ?? ''), isPrimary],
  );
  if (isPrimary) {
    await client.query('UPDATE studio SET primary_surface_id = $2, updated_at = NOW() WHERE id = $1', [studioId, id]);
  }
  return inserted.rows[0];
}

export async function listStudioPlaybooks({ studioKind = null } = {}) {
  const params = [];
  let where = '';
  if (studioKind) {
    params.push(studioKind);
    where = 'WHERE studio_kind = $1';
  }
  const result = await pool.query(
    `SELECT * FROM studio_playbook ${where} ORDER BY studio_kind, title`,
    params,
  );
  return result.rows.map(mapPlaybook);
}

export async function getStudioPlaybookById(id, client = pool) {
  const result = await client.query('SELECT * FROM studio_playbook WHERE id = $1', [id]);
  return mapPlaybook(result.rows[0]);
}

export async function createStudio(input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await createStudioRecordInTx(client, input, {
      createdBy: input.createdBy ?? input.created_by ?? 'user',
    });
    await appendStudioEvent(client, {
      artifactId: created.id,
      projectId: created.projectId,
      type: 'ArtifactCreated',
      payload: {
        artifactType: 'studio',
        title: created.title,
        studioKind: created.studioKind,
        playbookId: created.playbookId,
      },
      actorType: input.actorType ?? 'user',
      actorId: input.createdBy ?? input.created_by ?? 'user',
    });

    let primaryFlow = null;
    if (input.createPrimarySurface !== false) {
      primaryFlow = await createFlowDocumentInTx(client, created.projectId, {
        title: input.primarySurfaceTitle ?? `${created.title} Exploration`,
        description: input.primarySurfacePurpose ?? `Primary exploration surface for ${created.title}.`,
      });
      await createSurfaceInTx(client, {
        studioId: created.id,
        projectId: created.projectId,
        artifactId: primaryFlow.id,
        title: primaryFlow.title,
        purpose: input.primarySurfacePurpose ?? 'Primary exploration surface',
        isPrimary: true,
      });
    }
    await client.query('COMMIT');
    return getStudioOverview(created.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getStudio(id) {
  const result = await pool.query('SELECT * FROM studio WHERE id = $1', [id]);
  return mapStudio(result.rows[0]);
}

export async function listStudiosByProject(projectId, { includeArchived = false } = {}) {
  const result = await pool.query(
    `SELECT s.*
     FROM studio s
     JOIN artifact a ON a.id = s.id
     WHERE s.project_id = $1
       AND ($2::boolean OR a.archived_at IS NULL)
     ORDER BY s.updated_at DESC`,
    [projectId, includeArchived],
  );
  return result.rows.map(mapStudio);
}

export async function updateStudio(id, patch = {}) {
  const result = await pool.query(
    `UPDATE studio SET
       title = COALESCE($2, title),
       description = COALESCE($3, description),
       state = COALESCE($4, state),
       playbook_id = COALESCE($5, playbook_id),
       team_config = COALESCE($6::jsonb, team_config),
       settings = COALESCE($7::jsonb, settings),
       summary = COALESCE($8, summary),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.title ?? null,
      patch.description ?? null,
      patch.state ?? null,
      patch.playbookId ?? patch.playbook_id ?? null,
      patch.teamConfig !== undefined || patch.team_config !== undefined
        ? JSON.stringify(patch.teamConfig ?? patch.team_config)
        : null,
      patch.settings !== undefined ? JSON.stringify(patch.settings) : null,
      patch.summary ?? null,
    ],
  );
  if (result.rows[0]) {
    await pool.query(
      `UPDATE artifact
       SET title = $2, description = $3, metadata = metadata || $4::jsonb,
           updated_at = NOW(), updated_by = $5
       WHERE id = $1`,
      [
        id,
        result.rows[0].title,
        result.rows[0].description,
        JSON.stringify({ title: result.rows[0].title, studio_state: result.rows[0].state }),
        patch.updatedBy ?? patch.updated_by ?? 'user',
      ],
    );
  }
  return mapStudio(result.rows[0]);
}

export async function archiveStudio(id, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE studio
       SET state = 'archived', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );
    const studio = mapStudio(result.rows[0]);
    if (!studio) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `UPDATE artifact
       SET archived_at = COALESCE(archived_at, NOW()),
           updated_at = NOW(),
           updated_by = $2,
           metadata = metadata || $3::jsonb
       WHERE id = $1`,
      [
        id,
        input.actorId ?? input.actor_id ?? input.updatedBy ?? input.updated_by ?? 'user',
        JSON.stringify({ studio_state: 'archived', archive_reason: input.reason ?? '' }),
      ],
    );
    await appendStudioEvent(client, {
      artifactId: id,
      projectId: studio.projectId,
      type: 'ArtifactArchived',
      payload: { reason: input.reason ?? '', studioId: id },
      actorType: input.actorType ?? input.actor_type ?? 'user',
      actorId: input.actorId ?? input.actor_id ?? 'user',
    });
    if (studio.parentStudioId) {
      await removeChildStudioNodeFromParentFlowInTx(client, studio.parentStudioId, id);
    }
    await client.query('COMMIT');
    return studio;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function restoreStudio(id, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE studio
       SET state = 'seeded', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );
    const studio = mapStudio(result.rows[0]);
    if (!studio) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query(
      `UPDATE artifact
       SET archived_at = NULL,
           updated_at = NOW(),
           updated_by = $2,
           metadata = metadata || $3::jsonb
       WHERE id = $1`,
      [
        id,
        input.actorId ?? input.actor_id ?? input.updatedBy ?? input.updated_by ?? 'user',
        JSON.stringify({ studio_state: 'seeded', restore_reason: input.reason ?? '' }),
      ],
    );
    await appendStudioEvent(client, {
      artifactId: id,
      projectId: studio.projectId,
      type: 'StateTransitioned',
      payload: {
        fromStateId: 'archived',
        toStateId: 'seeded',
        reason: input.reason ?? 'Restored',
        studioId: id,
      },
      actorType: input.actorType ?? input.actor_type ?? 'user',
      actorId: input.actorId ?? input.actor_id ?? 'user',
    });
    if (studio.parentStudioId) {
      await ensureChildStudioNodeInParentFlowInTx(client, studio.parentStudioId, id, studio.title);
    }
    await client.query('COMMIT');
    return studio;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listStudioSurfaces(studioId) {
  const result = await pool.query(
    `SELECT ss.*, fd.id AS flow_id, fd.title AS flow_title, fd.description AS flow_description,
            fd.snapshot_path AS flow_snapshot_path, fd.revision AS flow_revision
     FROM studio_surface ss
     LEFT JOIN flow_document fd ON fd.id = ss.artifact_id
     WHERE ss.studio_id = $1
     ORDER BY ss.is_primary DESC, ss.updated_at DESC`,
    [studioId],
  );
  return result.rows.map(mapSurface);
}

export async function createStudioSurface(studioId, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const studioResult = await client.query('SELECT * FROM studio WHERE id = $1', [studioId]);
    const studio = studioResult.rows[0];
    if (!studio) throw new Error('studio not found');
    let artifactId = input.artifactId ?? input.artifact_id ?? null;
    if (artifactId) {
      const flow = await client.query(
        'SELECT id, project_id, title FROM flow_document WHERE id = $1',
        [artifactId],
      );
      if (!flow.rows[0]) throw new Error('studio exploration surface must reference a flow artifact');
      if (flow.rows[0].project_id !== studio.project_id) throw new Error('surface artifact must belong to the studio project');
    } else {
      const flow = await createFlowDocumentInTx(client, studio.project_id, {
        title: input.title ?? `${studio.title} Exploration`,
        description: input.purpose ?? '',
      });
      artifactId = flow.id;
    }
    const surface = await createSurfaceInTx(client, {
      studioId,
      projectId: studio.project_id,
      artifactId,
      surfaceType: input.surfaceType ?? input.surface_type ?? 'exploration',
      title: input.title ?? 'Studio Exploration',
      purpose: input.purpose ?? '',
      isPrimary: input.isPrimary ?? input.is_primary ?? false,
    });
    await appendStudioEvent(client, {
      artifactId: studioId,
      projectId: studio.project_id,
      type: 'ContentUpdated',
      payload: { changedFields: ['studio_surface'], surfaceId: surface.id, artifactId },
      actorType: input.actorType ?? 'user',
      actorId: input.createdBy ?? input.created_by ?? 'user',
    });
    await client.query('COMMIT');
    return mapSurface(surface);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createStudioContextPacket(studioId, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const studioResult = await client.query('SELECT * FROM studio WHERE id = $1', [studioId]);
    const studio = studioResult.rows[0];
    if (!studio) throw new Error('studio not found');
    const targetStudioId = input.targetStudioId ?? input.target_studio_id ?? null;
    if (targetStudioId) {
      const target = await client.query('SELECT project_id FROM studio WHERE id = $1', [targetStudioId]);
      if (!target.rows[0]) throw new Error('target studio not found');
      if (target.rows[0].project_id !== studio.project_id) throw new Error('target studio must belong to the same project');
    }
    const id = newUlid();
    const result = await client.query(
      `INSERT INTO studio_context_packet
       (id, source_studio_id, target_studio_id, project_id, title, focal_question,
        artifact_ids, summary, constraints, expected_outputs)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9::jsonb, $10::jsonb)
       RETURNING *`,
      [
        id,
        studioId,
        targetStudioId,
        studio.project_id,
        String(input.title ?? 'Studio context packet'),
        String(input.focalQuestion ?? input.focal_question ?? ''),
        input.artifactIds ?? input.artifact_ids ?? [],
        String(input.summary ?? ''),
        JSON.stringify(input.constraints ?? []),
        JSON.stringify(input.expectedOutputs ?? input.expected_outputs ?? []),
      ],
    );
    await appendStudioEvent(client, {
      artifactId: studioId,
      projectId: studio.project_id,
      type: 'ContentUpdated',
      payload: { changedFields: ['studio_context_packet'], contextPacketId: id },
      actorType: input.actorType ?? 'user',
      actorId: input.createdBy ?? input.created_by ?? 'user',
    });
    await client.query('COMMIT');
    return mapContextPacket(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function invokeChildStudio(studioId, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const parentResult = await client.query('SELECT * FROM studio WHERE id = $1', [studioId]);
    const parent = parentResult.rows[0];
    if (!parent) throw new Error('studio not found');
    const playbookId = input.playbookId ?? input.playbook_id ?? 'builtin_generic_domain_studio';
    const childTitle = String(input.title ?? '').trim()
      || `${parent.title} Deep Dive`;
    const actorId = input.createdBy ?? input.created_by ?? 'user';
    const child = await createStudioRecordInTx(client, {
      projectId: parent.project_id,
      title: childTitle,
      description: input.description ?? input.goal ?? '',
      studioKind: input.studioKind ?? input.studio_kind ?? 'domain',
      playbookId,
      parentStudioId: studioId,
      parentArtifactId: input.parentArtifactId ?? input.parent_artifact_id ?? null,
      summary: input.summary ?? '',
      settings: {
        ...(input.settings ?? {}),
        invokedFromStudioId: studioId,
      },
    }, { createdBy: actorId });

    let primaryFlow = null;
    if (input.createPrimarySurface !== false) {
      primaryFlow = await createFlowDocumentInTx(client, parent.project_id, {
        title: input.primarySurfaceTitle ?? `${child.title} Exploration`,
        description: input.primarySurfacePurpose ?? `Primary exploration surface for ${child.title}.`,
      });
      await createSurfaceInTx(client, {
        studioId: child.id,
        projectId: parent.project_id,
        artifactId: primaryFlow.id,
        title: primaryFlow.title,
        purpose: input.primarySurfacePurpose ?? 'Primary child exploration surface',
        isPrimary: true,
      });
    }

    const artifactIds = input.artifactIds ?? input.artifact_ids ?? [];
    const contextPacketId = newUlid();
    const contextResult = await client.query(
      `INSERT INTO studio_context_packet
       (id, source_studio_id, target_studio_id, project_id, title, focal_question,
        artifact_ids, summary, constraints, expected_outputs)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9::jsonb, $10::jsonb)
       RETURNING *`,
      [
        contextPacketId,
        studioId,
        child.id,
        parent.project_id,
        String(input.contextTitle ?? input.context?.title ?? `${childTitle} context`),
        String(input.focalQuestion ?? input.focal_question ?? input.context?.focalQuestion ?? ''),
        artifactIds,
        String(input.contextSummary ?? input.summary ?? input.context?.summary ?? ''),
        JSON.stringify(input.constraints ?? input.context?.constraints ?? []),
        JSON.stringify(input.expectedOutputs ?? input.expected_outputs ?? input.context?.expectedOutputs ?? []),
      ],
    );

    const stepId = newUlid();
    const stepResult = await client.query(
      `INSERT INTO studio_step
       (id, run_id, studio_id, project_id, title, performer_kind, performer_ref,
        goal, input_artifact_ids, output_artifact_ids, status, child_studio_id)
       VALUES ($1, NULL, $2, $3, $4, 'studio', $5, $6, $7::text[], $8::text[], 'completed', $9)
       RETURNING *`,
      [
        stepId,
        studioId,
        parent.project_id,
        String(input.stepTitle ?? `Invoke ${childTitle}`),
        child.id,
        String(input.goal ?? input.focalQuestion ?? input.focal_question ?? ''),
        artifactIds,
        [child.id],
        child.id,
      ],
    );

    await appendStudioEvent(client, {
      artifactId: child.id,
      projectId: parent.project_id,
      type: 'ArtifactCreated',
      payload: {
        artifactType: 'studio',
        title: child.title,
        studioKind: child.studioKind,
        playbookId: child.playbookId,
        parentStudioId: studioId,
        contextPacketId,
      },
      actorType: input.actorType ?? 'user',
      actorId,
    });
    await appendStudioEvent(client, {
      artifactId: studioId,
      projectId: parent.project_id,
      type: 'ContentUpdated',
      payload: {
        changedFields: ['studio_step', 'child_studio', 'studio_context_packet'],
        stepId,
        childStudioId: child.id,
        contextPacketId,
      },
      actorType: input.actorType ?? 'user',
      actorId,
    });
    await client.query('COMMIT');
    return {
      childStudio: await getStudio(child.id),
      childOverview: await getStudioOverview(child.id),
      contextPacket: mapContextPacket(contextResult.rows[0]),
      step: mapStudioStep(stepResult.rows[0]),
      parentOverview: await getStudioOverview(studioId),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listStudioCandidates(studioId) {
  const result = await pool.query(
    `SELECT c.*, a.title AS artifact_title, a.type AS artifact_type
     FROM studio_candidate_artifact c
     JOIN artifact a ON a.id = c.underlying_artifact_id
     WHERE c.studio_id = $1
     ORDER BY c.updated_at DESC`,
    [studioId],
  );
  return result.rows.map(mapCandidate);
}

export async function createStudioCandidate(studioId, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const studioResult = await client.query('SELECT * FROM studio WHERE id = $1', [studioId]);
    const studio = mapStudio(studioResult.rows[0]);
    if (!studio) throw new Error('studio not found');
    const artifactId = input.underlyingArtifactId ?? input.underlying_artifact_id ?? input.artifactId ?? input.artifact_id;
    if (!artifactId) throw new Error('underlyingArtifactId is required');
    const artifactResult = await client.query('SELECT id, project_id FROM artifact WHERE id = $1', [artifactId]);
    const artifact = artifactResult.rows[0];
    if (!artifact) throw new Error('artifact not found');
    if (artifact.project_id && artifact.project_id !== studio.projectId) {
      throw new Error('candidate artifact belongs to another project');
    }
    const id = newUlid();
    const result = await client.query(
      `INSERT INTO studio_candidate_artifact
       (id, studio_id, project_id, underlying_artifact_id, status,
        provenance_run_id, provenance_step_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (studio_id, underlying_artifact_id)
       DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
       RETURNING *`,
      [
        id,
        studioId,
        studio.projectId,
        artifactId,
        input.status ?? 'under_review',
        input.provenanceRunId ?? input.provenance_run_id ?? null,
        input.provenanceStepId ?? input.provenance_step_id ?? null,
        String(input.notes ?? ''),
      ],
    );
    await appendStudioEvent(client, {
      artifactId: studioId,
      projectId: studio.projectId,
      type: 'ContentUpdated',
      payload: { changedFields: ['studio_candidate_artifact'], candidateArtifactId: result.rows[0].id },
      actorType: input.actorType ?? 'user',
      actorId: input.actorId ?? 'user',
    });
    await client.query('COMMIT');
    return mapCandidate(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateStudioCandidate(candidateId, patch = {}) {
  const result = await pool.query(
    `UPDATE studio_candidate_artifact
     SET status = COALESCE($2, status),
         notes = COALESCE($3, notes),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [candidateId, patch.status ?? null, patch.notes ?? null],
  );
  return mapCandidate(result.rows[0]);
}

export async function listStudioPromotions(studioId) {
  const result = await pool.query(
    `SELECT p.*, a.title AS candidate_title, c.underlying_artifact_id AS candidate_underlying_artifact_id
     FROM studio_promotion_decision p
     JOIN studio_candidate_artifact c ON c.id = p.candidate_artifact_id
     JOIN artifact a ON a.id = c.underlying_artifact_id
     WHERE p.source_studio_id = $1 OR p.target_studio_id = $1
     ORDER BY p.created_at DESC`,
    [studioId],
  );
  return result.rows.map(mapPromotion);
}

export async function createStudioPromotion(studioId, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const candidateId = input.candidateArtifactId ?? input.candidate_artifact_id;
    if (!candidateId) throw new Error('candidateArtifactId is required');
    const candidateResult = await client.query('SELECT * FROM studio_candidate_artifact WHERE id = $1', [candidateId]);
    const candidate = mapCandidate(candidateResult.rows[0]);
    if (!candidate) throw new Error('candidate not found');
    if (candidate.studioId !== studioId) throw new Error('candidate does not belong to this studio');
    const targetStudioId = input.targetStudioId ?? input.target_studio_id ?? null;
    const result = await client.query(
      `INSERT INTO studio_promotion_decision
       (id, source_studio_id, target_studio_id, target_artifact_id, project_id,
        candidate_artifact_id, action, status, rationale, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'proposed', $8, $9)
       RETURNING *`,
      [
        newUlid(),
        studioId,
        targetStudioId,
        input.targetArtifactId ?? input.target_artifact_id ?? null,
        candidate.projectId,
        candidateId,
        input.action ?? 'attach_as_reference',
        String(input.rationale ?? ''),
        input.approvedBy ?? input.approved_by ?? null,
      ],
    );
    await appendStudioEvent(client, {
      artifactId: studioId,
      projectId: candidate.projectId,
      type: 'ContentUpdated',
      payload: { changedFields: ['studio_promotion_decision'], promotionId: result.rows[0].id },
      actorType: input.actorType ?? 'user',
      actorId: input.actorId ?? 'user',
    });
    await client.query('COMMIT');
    return mapPromotion(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function applyStudioPromotion(promotionId, input = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const promotionResult = await client.query(
      `SELECT p.*, c.underlying_artifact_id AS candidate_underlying_artifact_id
       FROM studio_promotion_decision p
       JOIN studio_candidate_artifact c ON c.id = p.candidate_artifact_id
       WHERE p.id = $1
       FOR UPDATE`,
      [promotionId],
    );
    const promotionRow = promotionResult.rows[0];
    if (!promotionRow) throw new Error('promotion not found');
    if (promotionRow.status === 'applied') {
      await client.query('COMMIT');
      return mapPromotion(promotionRow);
    }
    const result = await client.query(
      `UPDATE studio_promotion_decision
       SET status = 'applied',
           approved_by = COALESCE($2, approved_by),
           applied_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [promotionId, input.approvedBy ?? input.approved_by ?? input.actorId ?? input.actor_id ?? 'user'],
    );
    await client.query(
      `UPDATE studio_candidate_artifact
       SET status = 'promoted', updated_at = NOW()
       WHERE id = $1`,
      [promotionRow.candidate_artifact_id],
    );
    await appendStudioEvent(client, {
      artifactId: promotionRow.source_studio_id,
      projectId: promotionRow.project_id,
      type: 'ContentUpdated',
      payload: {
        changedFields: ['studio_promotion_decision'],
        promotionId,
        promotedArtifactId: promotionRow.candidate_underlying_artifact_id,
      },
      actorType: input.actorType ?? input.actor_type ?? 'user',
      actorId: input.actorId ?? input.actor_id ?? 'user',
    });
    await client.query('COMMIT');
    return mapPromotion({
      ...result.rows[0],
      candidate_underlying_artifact_id: promotionRow.candidate_underlying_artifact_id,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getStudioOverview(id) {
  const studio = await getStudio(id);
  if (!studio) return null;
  const [surfaces, children, archivedChildren, playbooks, parent] = await Promise.all([
    listStudioSurfaces(id),
    pool.query(
      `SELECT s.*
       FROM studio s
       JOIN artifact a ON a.id = s.id
       WHERE s.parent_studio_id = $1
         AND a.archived_at IS NULL
       ORDER BY s.updated_at DESC`,
      [id],
    ),
    pool.query(
      `SELECT s.*, a.metadata AS artifact_metadata, a.archived_at
       FROM studio s
       JOIN artifact a ON a.id = s.id
       WHERE s.parent_studio_id = $1
         AND a.archived_at IS NOT NULL
       ORDER BY a.archived_at DESC`,
      [id],
    ),
    studio.playbookId ? pool.query('SELECT * FROM studio_playbook WHERE id = $1', [studio.playbookId]) : { rows: [] },
    studio.parentStudioId ? pool.query('SELECT * FROM studio WHERE id = $1', [studio.parentStudioId]) : { rows: [] },
  ]);
  const counts = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM studio_candidate_artifact WHERE studio_id = $1) AS candidates,
       (SELECT COUNT(*) FROM studio_promotion_decision WHERE source_studio_id = $1 AND status IN ('proposed','approved')) AS promotions,
       (SELECT COUNT(*) FROM studio_run WHERE studio_id = $1) AS runs`,
    [id],
  );
  return {
    studio,
    parentStudio: mapStudio(parent.rows[0]),
    playbook: mapPlaybook(playbooks.rows[0]),
    surfaces,
    childStudios: children.rows.map(mapStudio),
    archivedChildStudios: archivedChildren.rows.map((row) => ({
      ...mapStudio(row),
      archiveReason: row.artifact_metadata?.archive_reason ?? '',
      archivedAt: row.archived_at ?? null,
    })),
    counts: {
      candidates: Number(counts.rows[0]?.candidates ?? 0),
      promotions: Number(counts.rows[0]?.promotions ?? 0),
      runs: Number(counts.rows[0]?.runs ?? 0),
      childStudios: children.rows.length,
    },
    placeholders: {
      candidates: await listStudioCandidates(id),
      promotions: await listStudioPromotions(id),
      runs: [],
      contextPackets: [],
    },
  };
}

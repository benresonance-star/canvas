import { pool } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';

function artifactIdsForEntry(entry) {
  return [...new Set(
    (entry?.versions ?? []).map((version) => version?.artifactRef?.id).filter(Boolean),
  )];
}

function stripProjectionVersions(payload) {
  const strip = (entries) => (entries ?? []).map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const { artifactViewVersion: _version, ...persisted } = entry;
    return persisted;
  });
  return {
    ...payload,
    cards: strip(payload?.cards),
    stagedSyncCards: strip(payload?.stagedSyncCards),
  };
}

function applyPlacementToCompatibilityPayload(payload, artifactId, placement) {
  let matchCount = 0;
  const cards = (payload?.cards ?? []).map((card) => {
    if (card?.type !== 'user_note' || !artifactIdsForEntry(card).includes(artifactId)) return card;
    matchCount += 1;
    return {
      ...card,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      ...(placement.zIndex == null ? {} : { zIndex: placement.zIndex }),
    };
  });
  return { payload: { ...payload, cards }, matchCount };
}

function compatibilitySurfaceCounts(payload, artifactId) {
  const count = (entries) => (entries ?? []).filter(
    (entry) => entry?.type === 'user_note' && artifactIdsForEntry(entry).includes(artifactId),
  ).length;
  return {
    canvas: count(payload?.cards),
    dock: count(payload?.stagedSyncCards),
  };
}

function validateTransferProjection(payload, transfer) {
  const counts = compatibilitySurfaceCounts(payload, transfer.artifactId);
  if (counts[transfer.fromSurface] !== 0 || counts[transfer.toSurface] !== 1) {
    const error = new Error('Invalid compatibility transfer projection');
    error.status = 409;
    throw error;
  }
  if (transfer.toSurface === 'canvas') {
    const card = (payload.cards ?? []).find(
      (entry) => entry?.type === 'user_note'
        && artifactIdsForEntry(entry).includes(transfer.artifactId),
    );
    for (const field of ['x', 'y', 'width', 'height']) {
      if (Number(card?.[field]) !== Number(transfer[field])) {
        const error = new Error('Compatibility geometry does not match transfer');
        error.status = 409;
        throw error;
      }
    }
  }
}

export async function commitArtifactViewTransfer(projectId, input) {
  const client = await pool.connect();
  const transfer = input.transfer;
  try {
    await client.query('BEGIN');
    const documentResult = await client.query(
      `SELECT revision FROM canvas_project_document
       WHERE project_id = $1 FOR UPDATE`,
      [projectId],
    );
    if (!documentResult.rows[0]) {
      const error = new Error('Project not found');
      error.status = 404;
      throw error;
    }
    const sourceResult = await client.query(
      `SELECT * FROM artifact_view
       WHERE project_id = $1 AND artifact_id = $2 AND surface = $3
         AND view_type = 'card' AND archived_at IS NULL FOR UPDATE`,
      [projectId, transfer.artifactId, transfer.fromSurface],
    );
    const source = sourceResult.rows[0];
    if (!source) {
      const error = new Error('Source artifact view not found');
      error.status = 404;
      throw error;
    }
    if (Number(source.version) !== Number(transfer.expectedVersion)) {
      const error = new Error('Artifact view revision conflict');
      error.status = 409;
      error.currentVersion = Number(source.version);
      throw error;
    }
    const targetResult = await client.query(
      `SELECT id FROM artifact_view
       WHERE project_id = $1 AND artifact_id = $2 AND surface = $3
         AND view_type = 'card' AND archived_at IS NULL FOR UPDATE`,
      [projectId, transfer.artifactId, transfer.toSurface],
    );
    if (targetResult.rows[0]) {
      const error = new Error('Target artifact view already exists');
      error.status = 409;
      throw error;
    }
    const compatibilityPayload = stripProjectionVersions(input.payload);
    validateTransferProjection(compatibilityPayload, transfer);
    await client.query(
      `UPDATE artifact_view
       SET archived_at = NOW(), updated_at = NOW(), version = version + 1
       WHERE id = $1 AND version = $2`,
      [source.id, transfer.expectedVersion],
    );
    const inserted = await client.query(
      `INSERT INTO artifact_view (
         id, project_id, artifact_id, surface, view_type,
         x, y, width, height, z_index, view_state, version, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,'card',$5,$6,$7,$8,$9,'{}'::jsonb,1,NOW(),NOW())
       RETURNING artifact_id, surface, version, updated_at`,
      [
        newUlid(), projectId, transfer.artifactId, transfer.toSurface,
        transfer.toSurface === 'canvas' ? transfer.x : null,
        transfer.toSurface === 'canvas' ? transfer.y : null,
        transfer.toSurface === 'canvas' ? transfer.width : null,
        transfer.toSurface === 'canvas' ? transfer.height : null,
        transfer.toSurface === 'canvas' ? (transfer.zIndex ?? null) : null,
      ],
    );
    const documentRevision = Number(documentResult.rows[0].revision) + 1;
    const documentUpdate = await client.query(
      `UPDATE canvas_project_document
       SET payload = $2::jsonb, revision = $3, updated_at = NOW()
       WHERE project_id = $1 AND revision = $4
       RETURNING revision, updated_at`,
      [projectId, JSON.stringify(compatibilityPayload), documentRevision, documentResult.rows[0].revision],
    );
    if (!documentUpdate.rows[0]) {
      const error = new Error('Project revision conflict');
      error.status = 409;
      throw error;
    }
    await client.query(
      `INSERT INTO canvas_event
         (id, occurred_at, actor, action, target_id, target_type, project_id, before, after)
       VALUES ($1, NOW(), $2::jsonb, 'artifact_view_surface_transferred', $3,
               'artifact_view', $4, $5::jsonb, $6::jsonb)`,
      [
        newUlid(),
        JSON.stringify({ kind: 'human', id: input.actorId || 'user:local' }),
        transfer.artifactId,
        projectId,
        JSON.stringify({ surface: transfer.fromSurface, version: transfer.expectedVersion }),
        JSON.stringify({ surface: transfer.toSurface, version: 1 }),
      ],
    );
    await client.query('COMMIT');
    return {
      documentRevision,
      updatedAt: documentUpdate.rows[0].updated_at,
      view: {
        artifactId: inserted.rows[0].artifact_id,
        surface: inserted.rows[0].surface,
        version: Number(inserted.rows[0].version),
        updatedAt: inserted.rows[0].updated_at,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function commitArtifactViewPlacements(projectId, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const documentResult = await client.query(
      `SELECT payload, revision FROM canvas_project_document
       WHERE project_id = $1 FOR UPDATE`,
      [projectId],
    );
    if (!documentResult.rows[0]) {
      const error = new Error('Project not found');
      error.status = 404;
      throw error;
    }
    let payload = stripProjectionVersions(documentResult.rows[0].payload);
    const updatedViews = [];
    for (const placement of input.placements) {
      const viewResult = await client.query(
        `SELECT * FROM artifact_view
         WHERE project_id = $1 AND artifact_id = $2
           AND surface = 'canvas' AND view_type = 'card' AND archived_at IS NULL
         FOR UPDATE`,
        [projectId, placement.artifactId],
      );
      const view = viewResult.rows[0];
      if (!view) {
        const error = new Error('Artifact view not found');
        error.status = 404;
        throw error;
      }
      if (Number(view.version) !== Number(placement.expectedVersion)) {
        const error = new Error('Artifact view revision conflict');
        error.status = 409;
        error.currentVersion = Number(view.version);
        throw error;
      }
      const compatibility = applyPlacementToCompatibilityPayload(payload, placement.artifactId, placement);
      if (compatibility.matchCount !== 1) {
        const error = new Error('Expected exactly one compatibility card');
        error.status = 409;
        throw error;
      }
      payload = compatibility.payload;
      const updated = await client.query(
        `UPDATE artifact_view
         SET x = $3, y = $4, width = $5, height = $6, z_index = $7,
             version = version + 1, updated_at = NOW()
         WHERE id = $1 AND version = $2
         RETURNING artifact_id, version, updated_at`,
        [
          view.id, placement.expectedVersion, placement.x, placement.y,
          placement.width, placement.height, placement.zIndex ?? null,
        ],
      );
      if (!updated.rows[0]) {
        const error = new Error('Artifact view revision conflict');
        error.status = 409;
        throw error;
      }
      updatedViews.push({
        artifactId: updated.rows[0].artifact_id,
        version: Number(updated.rows[0].version),
        updatedAt: updated.rows[0].updated_at,
      });
    }
    const documentRevision = Number(documentResult.rows[0].revision) + 1;
    const documentUpdate = await client.query(
      `UPDATE canvas_project_document
       SET payload = $2::jsonb, revision = $3, updated_at = NOW()
       WHERE project_id = $1 AND revision = $4
       RETURNING revision, updated_at`,
      [projectId, JSON.stringify(payload), documentRevision, documentResult.rows[0].revision],
    );
    if (!documentUpdate.rows[0]) {
      const error = new Error('Project revision conflict');
      error.status = 409;
      throw error;
    }
    await client.query(
      `INSERT INTO canvas_event
         (id, occurred_at, actor, action, target_id, target_type, project_id, before, after)
       VALUES ($1, NOW(), $2::jsonb, 'artifact_view_placement_updated', $3,
               'artifact_view', $4, NULL, $5::jsonb)`,
      [
        newUlid(),
        JSON.stringify({ kind: 'human', id: input.actorId || 'user:local' }),
        projectId,
        projectId,
        JSON.stringify({ artifactIds: updatedViews.map((view) => view.artifactId) }),
      ],
    );
    await client.query('COMMIT');
    return {
      documentRevision,
      updatedAt: documentUpdate.rows[0].updated_at,
      views: updatedViews,
      payload,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

import { newUlid } from '../../src/primitives/shared/ulid.js';
import { query } from '../db.js';

function mapBimStylePreset(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    artifactId: row.artifact_id,
    cardId: row.card_id,
    name: row.name,
    description: row.description,
    tags: row.tags ?? [],
    style: row.style,
    schemaVersion: row.schema_version,
    isFavorite: row.is_favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeStylePayload(style) {
  if (!style || typeof style !== 'object' || Array.isArray(style)) {
    throw new Error('style must be a JSON object');
  }
  return style;
}

export async function saveBimStylePreset(projectId, input = {}) {
  const id = input.id ?? newUlid();
  const style = normalizeStylePayload(input.style ?? {});
  const res = await query(
    `INSERT INTO bim_style_preset
     (id, project_id, artifact_id, card_id, name, description, tags, style, schema_version, is_favorite)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       tags = EXCLUDED.tags,
       style = EXCLUDED.style,
       schema_version = EXCLUDED.schema_version,
       artifact_id = EXCLUDED.artifact_id,
       card_id = EXCLUDED.card_id,
       is_favorite = EXCLUDED.is_favorite,
       updated_at = NOW(),
       deleted_at = NULL
     RETURNING *`,
    [
      id,
      projectId,
      input.artifactId ?? null,
      input.cardId ?? null,
      String(input.name ?? 'Style preset'),
      String(input.description ?? ''),
      input.tags ?? [],
      JSON.stringify(style),
      Number.isFinite(Number(input.schemaVersion)) ? Number(input.schemaVersion) : 1,
      input.isFavorite === true,
    ],
  );
  return mapBimStylePreset(res.rows[0]);
}

export async function listBimStylePresets(projectId, { cardId = null } = {}) {
  const res = cardId
    ? await query(
      `SELECT * FROM bim_style_preset
       WHERE project_id = $1 AND deleted_at IS NULL
         AND (card_id IS NULL OR card_id = $2)
       ORDER BY is_favorite DESC, updated_at DESC`,
      [projectId, cardId],
    )
    : await query(
      `SELECT * FROM bim_style_preset
       WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY is_favorite DESC, updated_at DESC`,
      [projectId],
    );
  return res.rows.map(mapBimStylePreset);
}

export async function getBimStylePreset(presetId) {
  const res = await query(
    'SELECT * FROM bim_style_preset WHERE id = $1 AND deleted_at IS NULL',
    [presetId],
  );
  return mapBimStylePreset(res.rows[0]);
}

export async function updateBimStylePreset(presetId, input = {}) {
  const existing = await getBimStylePreset(presetId);
  if (!existing) return null;

  const style = input.style != null ? normalizeStylePayload(input.style) : existing.style;
  const res = await query(
    `UPDATE bim_style_preset SET
       name = $2,
       description = $3,
       tags = $4,
       style = $5::jsonb,
       schema_version = $6,
       artifact_id = $7,
       card_id = $8,
       is_favorite = $9,
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [
      presetId,
      input.name != null ? String(input.name) : existing.name,
      input.description != null ? String(input.description) : existing.description,
      input.tags ?? existing.tags ?? [],
      JSON.stringify(style),
      Number.isFinite(Number(input.schemaVersion))
        ? Number(input.schemaVersion)
        : (existing.schemaVersion ?? 1),
      input.artifactId !== undefined ? (input.artifactId ?? null) : existing.artifactId,
      input.cardId !== undefined ? (input.cardId ?? null) : existing.cardId,
      input.isFavorite != null ? input.isFavorite === true : existing.isFavorite === true,
    ],
  );
  return mapBimStylePreset(res.rows[0]);
}

export async function deleteBimStylePreset(presetId) {
  const res = await query(
    `UPDATE bim_style_preset
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [presetId],
  );
  return mapBimStylePreset(res.rows[0]);
}

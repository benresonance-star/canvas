import { pool, query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import { getAgentType } from './agent-types.js';

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function json(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

export function rowToAgentArtifact(row) {
  if (!row) return null;
  return {
    id: row.id,
    artifactType: 'agent',
    agentTypeId: row.agent_type_id,
    agentTypeName: row.agent_type_name ?? null,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? '',
    goal: row.goal ?? '',
    instructions: row.instructions ?? '',
    rules: parseJson(row.rules, []),
    skills: parseJson(row.skills, []),
    tools: parseJson(row.tools, []),
    memorySources: parseJson(row.memory_sources, []),
    modelPreferences: parseJson(row.model_preferences, []),
    transformerSettings: parseJson(row.transformer_settings, {}),
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_AGENT = `
  SELECT aa.*, at.name AS agent_type_name
  FROM agent_artifact aa
  LEFT JOIN agent_type at ON at.id = aa.agent_type_id
`;

export async function listAgentArtifacts(projectId, { includeArchived = false } = {}) {
  const res = await query(
    `${SELECT_AGENT}
     WHERE aa.project_id = $1 ${includeArchived ? '' : 'AND aa.archived_at IS NULL'}
     ORDER BY aa.updated_at DESC`,
    [projectId],
  );
  return res.rows.map(rowToAgentArtifact);
}

export async function getAgentArtifact(id) {
  const res = await query(`${SELECT_AGENT} WHERE aa.id = $1`, [id]);
  return rowToAgentArtifact(res.rows[0]);
}

export async function createAgentArtifact(projectId, fields = {}) {
  const type = await getAgentType(fields.agentTypeId || 'agent_type_image_generation');
  if (!type || type.archivedAt) throw new Error('Agent type not found');
  const id = fields.id || newUlid();
  const name = String(fields.name || '').trim() || 'Image Generation Agent';
  const goal = fields.goal ?? type.defaultGoal ?? '';
  const instructions = fields.instructions ?? type.defaultInstructions ?? '';
  const rules = fields.rules ?? type.defaultRules ?? [];
  const skills = fields.skills ?? type.defaultSkills ?? [];
  const tools = fields.tools ?? type.allowedTools ?? [];
  const memorySources = fields.memorySources ?? type.defaultMemorySources ?? [];
  const modelPreferences = fields.modelPreferences ?? [{ provider: 'local', model: 'placeholder' }];
  const transformerSettings = fields.transformerSettings ?? {
    provider: 'local',
    aspectRatio: '1:1',
    quality: 'standard',
    imageCount: 1,
    outputFormat: 'png',
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO artifact (id, type, uri, content_hash, version, source_authority, retrieved_at, payload_text, metadata)
       VALUES ($1, 'agent', $2, $3, '1', 'canvas.agent', NOW(), $4, $5)`,
      [
        id,
        `agent:${id}`,
        `agent:${id}`,
        instructions,
        JSON.stringify({ canvas_kind: 'agent', agentTypeId: type.id, projectId }),
      ],
    );
    const inserted = await client.query(
      `INSERT INTO agent_artifact (
         id, agent_type_id, project_id, name, description, goal, instructions,
         rules, skills, tools, memory_sources, model_preferences, transformer_settings
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        id,
        type.id,
        projectId,
        name,
        fields.description ?? '',
        goal,
        instructions,
        json(rules, []),
        json(skills, []),
        json(tools, []),
        json(memorySources, []),
        json(modelPreferences, []),
        json(transformerSettings, {}),
      ],
    );
    await client.query('COMMIT');
    return getAgentArtifact(inserted.rows[0].id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAgentArtifact(id, patch = {}) {
  const existing = await getAgentArtifact(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  const res = await query(
    `UPDATE agent_artifact SET
       name = $2,
       description = $3,
       goal = $4,
       instructions = $5,
       rules = $6,
       skills = $7,
       tools = $8,
       memory_sources = $9,
       model_preferences = $10,
       transformer_settings = $11,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      String(next.name || '').trim() || existing.name,
      next.description ?? '',
      next.goal ?? '',
      next.instructions ?? '',
      json(next.rules, []),
      json(next.skills, []),
      json(next.tools, []),
      json(next.memorySources, []),
      json(next.modelPreferences, []),
      json(next.transformerSettings, {}),
    ],
  );
  await query(
    `UPDATE artifact SET payload_text = $2, metadata = metadata || $3::jsonb WHERE id = $1`,
    [id, next.instructions ?? '', JSON.stringify({ name: next.name, goal: next.goal })],
  );
  return rowToAgentArtifact({ ...res.rows[0], agent_type_name: existing.agentTypeName });
}

export async function archiveAgentArtifact(id) {
  const res = await query(
    `UPDATE agent_artifact
     SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id],
  );
  return rowToAgentArtifact(res.rows[0]);
}

export async function duplicateAgentArtifact(id) {
  const existing = await getAgentArtifact(id);
  if (!existing) return null;
  return createAgentArtifact(existing.projectId, {
    ...existing,
    id: undefined,
    name: `${existing.name} Copy`,
  });
}

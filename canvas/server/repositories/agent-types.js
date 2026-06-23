import { query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';

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

export function rowToAgentType(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    defaultGoal: row.default_goal ?? '',
    defaultInstructions: row.default_instructions ?? '',
    defaultRules: parseJson(row.default_rules, []),
    defaultSkills: parseJson(row.default_skills, []),
    allowedTools: parseJson(row.allowed_tools, []),
    allowedTransformers: parseJson(row.allowed_transformers, []),
    defaultMemorySources: parseJson(row.default_memory_sources, []),
    uiLayout: parseJson(row.ui_layout, {}),
    validationRules: parseJson(row.validation_rules, []),
    isBuiltin: Boolean(row.is_builtin),
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function json(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

export async function listAgentTypes({ includeArchived = false } = {}) {
  const res = await query(
    `SELECT * FROM agent_type
     ${includeArchived ? '' : 'WHERE archived_at IS NULL'}
     ORDER BY is_builtin DESC, name ASC`,
  );
  return res.rows.map(rowToAgentType);
}

export async function getAgentType(id) {
  const res = await query('SELECT * FROM agent_type WHERE id = $1', [id]);
  return rowToAgentType(res.rows[0]);
}

export async function createAgentType(fields = {}) {
  const id = fields.id || newUlid();
  const res = await query(
    `INSERT INTO agent_type (
       id, name, description, default_goal, default_instructions,
       default_rules, default_skills, allowed_tools, allowed_transformers,
       default_memory_sources, ui_layout, validation_rules, is_builtin
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE)
     RETURNING *`,
    [
      id,
      String(fields.name || '').trim() || 'Untitled Agent Type',
      fields.description ?? '',
      fields.defaultGoal ?? '',
      fields.defaultInstructions ?? '',
      json(fields.defaultRules, []),
      json(fields.defaultSkills, []),
      json(fields.allowedTools, []),
      json(fields.allowedTransformers, []),
      json(fields.defaultMemorySources, []),
      json(fields.uiLayout, {}),
      json(fields.validationRules, []),
    ],
  );
  return rowToAgentType(res.rows[0]);
}

export async function updateAgentType(id, patch = {}) {
  const existing = await getAgentType(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  const res = await query(
    `UPDATE agent_type SET
       name = $2,
       description = $3,
       default_goal = $4,
       default_instructions = $5,
       default_rules = $6,
       default_skills = $7,
       allowed_tools = $8,
       allowed_transformers = $9,
       default_memory_sources = $10,
       ui_layout = $11,
       validation_rules = $12,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      String(next.name || '').trim() || existing.name,
      next.description ?? '',
      next.defaultGoal ?? '',
      next.defaultInstructions ?? '',
      json(next.defaultRules, []),
      json(next.defaultSkills, []),
      json(next.allowedTools, []),
      json(next.allowedTransformers, []),
      json(next.defaultMemorySources, []),
      json(next.uiLayout, {}),
      json(next.validationRules, []),
    ],
  );
  return rowToAgentType(res.rows[0]);
}

export async function deleteAgentType(id) {
  const active = await query(
    'SELECT COUNT(*)::int AS count FROM agent_artifact WHERE agent_type_id = $1 AND archived_at IS NULL',
    [id],
  );
  if (active.rows[0]?.count > 0) {
    const error = new Error('Agent type has active agent artifacts');
    error.status = 409;
    throw error;
  }
  const res = await query(
    'UPDATE agent_type SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW() WHERE id = $1 RETURNING *',
    [id],
  );
  return rowToAgentType(res.rows[0]);
}

export async function listSkillsRulesToolsTransformers() {
  const [skills, rules, tools, transformers] = await Promise.all([
    query('SELECT * FROM skill ORDER BY name ASC'),
    query('SELECT * FROM rule ORDER BY name ASC'),
    query('SELECT * FROM tool ORDER BY name ASC'),
    query('SELECT * FROM transformer ORDER BY name ASC'),
  ]);
  return {
    skills: skills.rows,
    rules: rules.rows,
    tools: tools.rows,
    transformers: transformers.rows,
  };
}

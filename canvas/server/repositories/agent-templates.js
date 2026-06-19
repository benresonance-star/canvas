import { pool, query } from '../db.js';
import { normalizeAgentTemplate } from '../../src/lib/agentTemplates.js';

function rowToTemplate(row, files = []) {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    description: row.description ?? '',
    provider: row.provider,
    model: row.model,
    enabled: row.enabled !== false,
    instructions: row.compiled?.instructions ?? '',
    skills: row.compiled?.skills ?? [],
    tools: row.compiled?.tools ?? [],
    files,
    updatedAt: row.updated_at,
    revision: Number(row.revision) || 1,
  };
}

function fileRowToPart(row) {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    content: row.content ?? '',
    parsed: row.parsed ?? {},
    updatedAt: row.updated_at,
    revision: Number(row.revision) || 1,
  };
}

function summaryForTemplate(template) {
  return {
    instructions: template.instructions,
    skills: template.skills,
    tools: template.tools,
  };
}

function validateExpectedRevision(expectedRevision) {
  const expected = Number(expectedRevision);
  if (!Number.isFinite(expected) || expected < 0) {
    throw new Error('expectedRevision must be a non-negative number');
  }
  return expected;
}

export async function listAgentTemplates() {
  const res = await query(
    `SELECT id, label, description, provider, model, enabled, compiled, updated_at, revision
     FROM agent_template
     ORDER BY label ASC`,
  );
  return res.rows.map((row) => rowToTemplate(row));
}

export async function getAgentTemplate(id) {
  const templateRes = await query(
    `SELECT id, label, description, provider, model, enabled, compiled, updated_at, revision
     FROM agent_template
     WHERE id = $1`,
    [id],
  );
  const row = templateRes.rows[0];
  if (!row) return null;
  const fileRes = await query(
    `SELECT id, kind, filename, content, parsed, updated_at, revision
     FROM agent_template_file
     WHERE template_id = $1
     ORDER BY kind ASC, filename ASC`,
    [id],
  );
  return rowToTemplate(row, fileRes.rows.map(fileRowToPart));
}

async function writeTemplateFiles(client, templateId, files) {
  await client.query('DELETE FROM agent_template_file WHERE template_id = $1', [templateId]);
  for (const file of files) {
    const fileId = String(file.id || '').startsWith(`${templateId}:`)
      ? file.id
      : `${templateId}:${file.id}`;
    await client.query(
      `INSERT INTO agent_template_file
         (id, template_id, kind, filename, content, parsed, updated_at, revision)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), 1)`,
      [
        fileId,
        templateId,
        file.kind,
        file.filename,
        file.content,
        JSON.stringify(file.parsed ?? {}),
      ],
    );
  }
}

export async function putAgentTemplate(input, expectedRevision = 0) {
  const expected = validateExpectedRevision(expectedRevision);
  const template = normalizeAgentTemplate(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, label, description, provider, model, enabled, compiled, updated_at, revision
       FROM agent_template
       WHERE id = $1
       FOR UPDATE`,
      [template.id],
    );
    const existingRow = existing.rows[0];
    if (!existingRow) {
      if (expected > 0) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          conflict: true,
          revision: 0,
          template: null,
          updatedAt: null,
        };
      }
      await client.query(
        `INSERT INTO agent_template
           (id, label, description, provider, model, enabled, compiled, updated_at, revision)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), 1)`,
        [
          template.id,
          template.label,
          template.description,
          template.provider,
          template.model,
          template.enabled,
          JSON.stringify(summaryForTemplate(template)),
        ],
      );
      await writeTemplateFiles(client, template.id, template.files);
      await client.query('COMMIT');
      const saved = await getAgentTemplate(template.id);
      return { ok: true, revision: saved.revision, updatedAt: saved.updatedAt, template: saved };
    }

    const currentRevision = Number(existingRow.revision) || 1;
    if (expected !== currentRevision) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        conflict: true,
        revision: currentRevision,
        template: rowToTemplate(existingRow),
        updatedAt: existingRow.updated_at,
      };
    }

    const nextRevision = currentRevision + 1;
    await client.query(
      `UPDATE agent_template
       SET label = $2,
           description = $3,
           provider = $4,
           model = $5,
           enabled = $6,
           compiled = $7::jsonb,
           updated_at = NOW(),
           revision = $8
       WHERE id = $1`,
      [
        template.id,
        template.label,
        template.description,
        template.provider,
        template.model,
        template.enabled,
        JSON.stringify(summaryForTemplate(template)),
        nextRevision,
      ],
    );
    await writeTemplateFiles(client, template.id, template.files);
    await client.query('COMMIT');
    const saved = await getAgentTemplate(template.id);
    return { ok: true, revision: saved.revision, updatedAt: saved.updatedAt, template: saved };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteAgentTemplate(id) {
  await query('DELETE FROM agent_template WHERE id = $1', [id]);
}

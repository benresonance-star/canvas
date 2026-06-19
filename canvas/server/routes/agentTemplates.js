import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  listAgentTemplates,
  getAgentTemplate,
  putAgentTemplate,
  deleteAgentTemplate,
} from '../repositories/agent-templates.js';
import { detectTemplateFileKind, labelFromAgentFolderName, slugifyAgentId } from '../../src/lib/agentTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MASTER_FILES_DIR = path.resolve(__dirname, '../../../Canvas Master Files');

function templateFromBody(body, id = null) {
  return {
    ...(body.template ?? body),
    ...(id ? { id } : {}),
  };
}

function sendSavedTemplate(res, result) {
  if (!result.ok) {
    return res.status(409).json({
      error: 'conflict',
      revision: result.revision,
      template: result.template,
      updatedAt: result.updatedAt,
    });
  }
  if (!result.template?.id) {
    return res.status(500).json({
      error: 'template save returned no template',
      revision: result.revision ?? 0,
      updatedAt: result.updatedAt ?? null,
    });
  }
  return res.json({
    template: result.template,
    revision: result.revision,
    updatedAt: result.updatedAt,
  });
}

function readTemplateBundle(folderPath) {
  const folderName = path.basename(folderPath);
  const files = [];
  const stack = [folderPath];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      const relativePath = path.relative(folderPath, fullPath).replace(/\\/g, '/');
      const kind = detectTemplateFileKind(relativePath);
      if (!kind) continue;
      files.push({
        id: slugifyAgentId(relativePath),
        kind,
        filename: relativePath,
        content: fs.readFileSync(fullPath, 'utf8'),
      });
    }
  }
  return {
    id: slugifyAgentId(folderName),
    label: labelFromAgentFolderName(folderName),
    files,
  };
}

async function importMasterTemplates() {
  if (!fs.existsSync(MASTER_FILES_DIR)) return [];
  const imported = [];
  for (const entry of fs.readdirSync(MASTER_FILES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^Agent\s*-/i.test(entry.name)) continue;
    const input = readTemplateBundle(path.join(MASTER_FILES_DIR, entry.name));
    const existing = await getAgentTemplate(input.id);
    const result = await putAgentTemplate(input, existing?.revision ?? 0);
    imported.push(result.template);
  }
  return imported;
}

/** @param {import('express').Express} app */
export function registerAgentTemplateRoutes(app) {
  app.get('/agent/templates', async (_req, res) => {
    try {
      const templates = await listAgentTemplates();
      res.json({ templates });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/agent/templates/:templateId', async (req, res) => {
    try {
      const template = await getAgentTemplate(req.params.templateId);
      if (!template) return res.status(404).json({ error: 'template not found' });
      res.json({ template });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/agent/templates', async (req, res) => {
    try {
      const result = await putAgentTemplate(templateFromBody(req.body), 0);
      return sendSavedTemplate(res, result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/agent/templates/import-master', async (_req, res) => {
    try {
      const templates = await importMasterTemplates();
      res.json({ templates });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/agent/templates/:templateId', async (req, res) => {
    try {
      const { expectedRevision } = req.body;
      if (expectedRevision === undefined || expectedRevision === null) {
        return res.status(400).json({ error: 'expectedRevision required' });
      }
      const result = await putAgentTemplate(
        templateFromBody(req.body, req.params.templateId),
        expectedRevision,
      );
      return sendSavedTemplate(res, result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/agent/templates/:templateId', async (req, res) => {
    try {
      await deleteAgentTemplate(req.params.templateId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

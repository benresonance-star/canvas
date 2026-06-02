import { getOrCreateClusterForProject } from '../repositories/clusters.js';
import {
  upsertArtifactByHash,
  getArtifactById,
  updateArtifactContent,
} from '../repositories/artifacts.js';
import {
  insertRelationship,
  insertRelationshipIfAbsent,
  deleteRelationship,
} from '../repositories/relationships.js';
import { getArtifactEdges } from '../repositories/graph.js';
import { insertNote, listNotesForTarget, deleteNote } from '../repositories/notes.js';
import {
  insertAssertion,
  listAssertionsForSubject,
  defaultConfidence,
  defaultScope,
} from '../repositories/assertions.js';
import { insertTask } from '../repositories/tasks.js';
import { primitiveRef } from '../../src/primitives/shared/primitive-ref.js';
import { fetchBookmarkPreview } from '../services/urlPreview.js';

/** @param {import('express').Express} app */
export function registerArtifactRoutes(app) {
  app.post('/bookmarks/preview', async (req, res) => {
    try {
      const { url } = req.body ?? {};
      const preview = await fetchBookmarkPreview(url);
      if (!preview.ok && preview.error === 'Preview not allowed for this host') {
        return res.status(400).json({ error: preview.error });
      }
      if (!preview.ok && preview.error === 'Invalid URL') {
        return res.status(400).json({ error: preview.error });
      }
      res.json(preview);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/artifacts/ingest', async (req, res) => {
    try {
      const { projectId, clusterId: bodyClusterId, files, relationships } = req.body;
      let clusterId = bodyClusterId;
      if (!clusterId && projectId) {
        const cluster = await getOrCreateClusterForProject(projectId);
        clusterId = cluster.id;
      }
      const results = [];
      for (const f of files || []) {
        const { artifact, created } = await upsertArtifactByHash(clusterId, f);
        results.push({
          artifactRef: primitiveRef(artifact.id, 'artifact'),
          content_hash: artifact.content_hash,
          created,
          uri: artifact.uri,
        });
      }
      const relResults = [];
      for (const r of relationships || []) {
        const { relationship } = await insertRelationshipIfAbsent(clusterId, r);
        relResults.push(relationship);
      }
      res.json({ clusterId, artifacts: results, relationships: relResults });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/artifacts/:id', async (req, res) => {
    try {
      const artifact = await getArtifactById(req.params.id);
      if (!artifact) return res.status(404).json({ error: 'not found' });
      res.json({ artifact });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/artifacts/:id', async (req, res) => {
    try {
      const { content_hash, payload_text } = req.body;
      if (!content_hash) return res.status(400).json({ error: 'content_hash required' });
      const artifact = await updateArtifactContent(req.params.id, {
        content_hash,
        payload_text,
      });
      res.json({ artifact });
    } catch (e) {
      const status = e.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: e.message });
    }
  });

  app.get('/artifacts/:id/edges', async (req, res) => {
    try {
      const edges = await getArtifactEdges(req.params.id);
      res.json(edges);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/relationships', async (req, res) => {
    try {
      const { clusterId, idempotent = true, ...fields } = req.body;
      const result =
        idempotent !== false
          ? await insertRelationshipIfAbsent(clusterId, fields)
          : { relationship: await insertRelationship(clusterId, fields), created: true };
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/relationships/:id', async (req, res) => {
    try {
      const deleted = await deleteRelationship(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'not found' });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/notes', async (req, res) => {
    try {
      const { clusterId, ...fields } = req.body;
      const note = await insertNote(clusterId, fields);
      res.json({ note });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/artifacts/:id/notes', async (req, res) => {
    try {
      const notes = await listNotesForTarget(req.params.id, 'artifact');
      res.json({ notes });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/notes/:id', async (req, res) => {
    try {
      const deleted = await deleteNote(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'not found' });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/assertions', async (req, res) => {
    try {
      const { clusterId, ...fields } = req.body;
      const assertion = await insertAssertion(clusterId, fields);
      res.json({ assertion });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/artifacts/:id/assertions', async (req, res) => {
    try {
      const assertions = await listAssertionsForSubject(req.params.id, 'artifact');
      res.json({ assertions });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/tasks', async (req, res) => {
    try {
      const { clusterId, ...fields } = req.body;
      const task = await insertTask(clusterId, fields);
      res.json({ task });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/assertions/defaults', (_req, res) => {
    res.json({ confidence: defaultConfidence(), scope: defaultScope() });
  });
}

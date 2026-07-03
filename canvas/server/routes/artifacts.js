import { getOrCreateClusterForProject } from '../repositories/clusters.js';
import {
  listArtifactsByProject,
  upsertArtifactByHash,
  getArtifactById,
  listArtifactRelationships,
} from '../repositories/artifacts.js';
import { appendArtifactEvent, listEventsForArtifact } from '../repositories/artifact-events.js';
import {
  archiveArtifactWithEvents,
  createArtifactWithEvents,
  transitionArtifactStateWithEvents,
  updateArtifactWithEvents,
} from '../services/artifactService.js';
import {
  createArtifactRelationship,
  getRelationshipById,
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
import { fetchBookmarkEmbedHtml, fetchBookmarkPreview } from '../services/urlPreview.js';
import {
  archiveArtifactRequestSchema,
  createArtifactRelationshipRequestSchema,
  createArtifactRequestSchema,
  parseRequest,
  transitionArtifactStateRequestSchema,
  updateArtifactRequestSchema,
} from '../schemas/artifacts.js';

function sendError(res, error) {
  const status = error.status || (error.message?.includes('not found') ? 404 : 400);
  res.status(status).json({ error: error.message });
}

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

  app.get('/bookmarks/embed', async (req, res) => {
    try {
      const result = await fetchBookmarkEmbedHtml(req.query?.url);
      if (!result.ok) {
        return res
          .status(result.status ?? 400)
          .type('html')
          .send(`<!doctype html><p>${result.error || 'Preview failed'}</p>`);
      }
      res
        .status(200)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .setHeader('Cache-Control', 'no-store')
        .send(result.html);
    } catch (e) {
      res.status(400).type('html').send(`<!doctype html><p>${e.message}</p>`);
    }
  });

  app.post('/artifacts', async (req, res) => {
    try {
      const input = parseRequest(createArtifactRequestSchema, req.body);
      const artifact = await createArtifactWithEvents(input);
      res.status(201).json({ artifact });
    } catch (e) {
      sendError(res, e);
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

  app.get('/projects/:projectId/artifacts', async (req, res) => {
    try {
      const artifacts = await listArtifactsByProject(req.params.projectId, {
        includeArchived: req.query.includeArchived === 'true',
        limit: req.query.limit,
      });
      res.json({ artifacts });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get('/artifacts/:id', async (req, res) => {
    try {
      const artifact = await getArtifactById(req.params.id);
      if (!artifact && req.query.optional === '1') return res.json({ artifact: null });
      if (!artifact) return res.status(404).json({ error: 'not found' });
      res.json({ artifact });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/artifacts/:id', async (req, res) => {
    try {
      const input = parseRequest(updateArtifactRequestSchema, req.body);
      const artifact = await updateArtifactWithEvents(req.params.id, input);
      res.json({ artifact });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post('/artifacts/:id/archive', async (req, res) => {
    try {
      const input = parseRequest(archiveArtifactRequestSchema, req.body);
      const artifact = await archiveArtifactWithEvents(req.params.id, input);
      res.json({ artifact });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post('/artifacts/:id/transition', async (req, res) => {
    try {
      const input = parseRequest(transitionArtifactStateRequestSchema, req.body);
      const result = await transitionArtifactStateWithEvents(req.params.id, input);
      res.json(result);
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get('/artifacts/:id/events', async (req, res) => {
    try {
      const events = await listEventsForArtifact(req.params.id, { limit: req.query.limit });
      res.json({ events });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get('/artifacts/:id/relationships', async (req, res) => {
    try {
      const relationships = await listArtifactRelationships(req.params.id);
      res.json({ relationships });
    } catch (e) {
      sendError(res, e);
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

  app.post('/artifact-relationships', async (req, res) => {
    try {
      const input = parseRequest(createArtifactRelationshipRequestSchema, req.body);
      const result = await createArtifactRelationship(input);
      await appendArtifactEvent({
        artifactId: input.sourceArtifactId,
        projectId: input.projectId ?? null,
        type: 'RelationshipAdded',
        payload: {
          relationshipId: result.relationship.id,
          sourceArtifactId: input.sourceArtifactId,
          targetArtifactId: input.targetArtifactId,
          relationshipType: input.relationshipType,
        },
        actorType: 'user',
        actorId: input.createdBy || 'user:local',
      });
      res.status(result.created ? 201 : 200).json(result);
    } catch (e) {
      sendError(res, e);
    }
  });

  app.delete('/artifact-relationships/:id', async (req, res) => {
    try {
      const existing = await getRelationshipById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Relationship not found' });
      const deleted = await deleteRelationship(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Relationship not found' });
      if (existing.from_ref?.type === 'artifact') {
        await appendArtifactEvent({
          artifactId: existing.from_ref.id,
          projectId: existing.project_id ?? null,
          type: 'RelationshipRemoved',
          payload: {
            relationshipId: req.params.id,
            sourceArtifactId: existing.from_ref.id,
            targetArtifactId: existing.to_ref?.id ?? null,
            relationshipType: existing.type,
          },
          actorType: 'user',
          actorId: req.query.actorId || 'user:local',
        });
      }
      res.json({ ok: true });
    } catch (e) {
      sendError(res, e);
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

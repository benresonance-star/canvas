import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import {
  getOrCreateClusterForProject,
  resolveClusterId,
  createSubCluster,
  listChildClusters,
  listAllDescendantClusters,
  getClusterMembers,
  addClusterMembers,
  removeClusterMember,
  archiveSubCluster,
  updateCluster,
} from './repositories/clusters.js';
import {
  upsertArtifactByHash,
  getArtifactById,
  updateArtifactContent,
} from './repositories/artifacts.js';
import {
  insertRelationship,
  insertRelationshipIfAbsent,
  deleteRelationship,
} from './repositories/relationships.js';
import { buildClusterGraph, getArtifactEdges } from './repositories/graph.js';
import { insertNote, listNotesForTarget, deleteNote } from './repositories/notes.js';
import { listClusterPrimitives, getPrimitiveDetail } from './repositories/primitives-list.js';
import { listClusterEvents } from './repositories/events-list.js';
import {
  insertAssertion,
  listAssertionsForSubject,
  defaultConfidence,
  defaultScope,
} from './repositories/assertions.js';
import { insertTask } from './repositories/tasks.js';
import { primitiveRef } from '../src/primitives/shared/primitive-ref.js';
import { runMigrations } from './migrate.js';
import { fetchBookmarkPreview } from './services/urlPreview.js';
import { isAllowedProvider } from './lib/agentConnectors.js';
import {
  listConnectorStatus,
  saveCredential,
  deleteCredential,
  getDecryptedApiKey,
  secretsAvailable,
} from './repositories/agent-credentials.js';
import { completeChat } from './services/openaiChat.js';
import { estimateChatInputTokens } from './lib/agentTokenEstimate.js';
import { checkOpenaiReachable } from './lib/openaiFetch.js';
import {
  getCanvasIndex,
  putCanvasIndex,
  getCanvasProject,
  getCanvasProjectMeta,
  putCanvasProject,
  deleteCanvasProject,
} from './repositories/canvas-projects.js';
import {
  getAgentChatSession,
  putAgentChatSession,
  deleteAgentChatSession,
  getAgentChatThreadIndex,
  putAgentChatThreadIndex,
  LEGACY_THREAD_ID,
} from './repositories/canvas-agent-chat.js';
import {
  getPreviewBlob,
  putPreviewBlob,
  deletePreviewBlobsForProject,
  PREVIEW_BLOB_MAX_BYTES,
} from './repositories/canvas-previews.js';
import {
  getSpecCanvasState,
  putSpecCanvasState,
} from './repositories/spec-canvas-state.js';
import {
  getSpecResource,
  detachSpecResourceForProject,
  linkSpecResourceToProject,
} from './repositories/spec-resources.js';
import {
  createSpecNoteLink,
  deleteSpecNoteLink,
  listSpecNoteLinksForNote,
} from './repositories/spec-note-links.js';
import { resolveMasterKey } from './lib/secretBox.js';
import {
  DB_UNAVAILABLE_MESSAGE,
  formatDbError,
  isDbConnectionError,
  dbErrorHttpStatus,
} from './lib/dbError.js';

const app = express();
const PORT = process.env.PORT || 3001;
const JSON_BODY_LIMIT = '52mb';

let dbReady = false;

/** @param {import('express').Response} res */
function requireDb(res) {
  if (dbReady) return true;
  res.status(503).json({ error: DB_UNAVAILABLE_MESSAGE });
  return false;
}

/**
 * @param {import('express').Response} res
 * @param {unknown} e
 * @param {{ validation?: boolean }} [opts]
 */
function sendClusterError(res, e, opts = {}) {
  if (isDbConnectionError(e)) {
    res.status(503).json({ error: DB_UNAVAILABLE_MESSAGE });
    return;
  }
  const msg = e instanceof Error ? e.message : formatDbError(e);
  if (opts.validation) {
    res.status(400).json({ error: msg });
    return;
  }
  res.status(dbErrorHttpStatus(e)).json({ error: msg });
}

app.use(cors());
app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.get('/health', async (_req, res) => {
  if (!dbReady) {
    return res.status(503).json({
      ok: false,
      dbReady: false,
      error: DB_UNAVAILABLE_MESSAGE,
    });
  }
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, dbReady: true });
  } catch (e) {
    res.status(503).json({ ok: false, dbReady: false, error: formatDbError(e) });
  }
});

app.get('/canvas/index', async (_req, res) => {
  try {
    const row = await getCanvasIndex();
    res.json({
      index: row?.payload ?? null,
      updatedAt: row?.updatedAt ?? null,
      revision: row?.revision ?? 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/canvas/index', async (req, res) => {
  try {
    const { index, expectedRevision } = req.body;
    if (!index || !Array.isArray(index.projects)) {
      return res.status(400).json({ error: 'index with projects array required' });
    }
    if (expectedRevision === undefined || expectedRevision === null) {
      return res.status(400).json({ error: 'expectedRevision required' });
    }
    for (const row of index.projects) {
      if (!row?.id) continue;
      const meta = await getCanvasProjectMeta(row.id);
      if (!meta) {
        console.warn(
          `[canvas] workspace index lists project ${row.id} but canvas_project_document is missing`,
        );
      }
    }
    const result = await putCanvasIndex(index, expectedRevision);
    if (!result.ok) {
      return res.status(409).json({
        error: 'conflict',
        revision: result.revision,
        index: result.payload,
        updatedAt: result.updatedAt,
      });
    }
    res.json({
      updatedAt: result.updatedAt,
      revision: result.revision,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/canvas/projects/:projectId/meta', async (req, res) => {
  try {
    const row = await getCanvasProjectMeta(req.params.projectId);
    if (!row) return res.status(404).json({ error: 'project not found' });
    res.json({ revision: row.revision, updatedAt: row.updatedAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/canvas/projects/:projectId', async (req, res) => {
  try {
    const row = await getCanvasProject(req.params.projectId);
    if (!row) return res.status(404).json({ error: 'project not found' });
    res.json({
      payload: row.payload,
      updatedAt: row.updatedAt,
      revision: row.revision,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/canvas/projects/:projectId', async (req, res) => {
  try {
    const { payload, expectedRevision } = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'payload required' });
    }
    if (expectedRevision === undefined || expectedRevision === null) {
      return res.status(400).json({ error: 'expectedRevision required' });
    }
    const result = await putCanvasProject(
      req.params.projectId,
      payload,
      expectedRevision,
    );
    if (!result.ok) {
      return res.status(409).json({
        error: 'conflict',
        revision: result.revision,
        payload: result.payload,
        updatedAt: result.updatedAt,
      });
    }
    res.json({ revision: result.revision, updatedAt: result.updatedAt });
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('too large') || msg.includes('payload')) {
      return res.status(413).json({ error: 'Project document too large for server storage' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.delete('/canvas/projects/:projectId', async (req, res) => {
  try {
    await deleteCanvasProject(req.params.projectId);
    await deletePreviewBlobsForProject(req.params.projectId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/canvas/projects/:projectId/spec-canvas', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const row = await getSpecCanvasState(req.params.projectId);
    if (!row) return res.status(404).json({ error: 'spec canvas not found' });
    res.json(row);
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.put('/canvas/projects/:projectId/spec-canvas', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const { layout, viewport, expectedVersion } = req.body;
    if (expectedVersion === undefined || expectedVersion === null) {
      return res.status(400).json({ error: 'expectedVersion required' });
    }
    const result = await putSpecCanvasState(
      req.params.projectId,
      { layout, viewport },
      expectedVersion,
    );
    if (!result.ok) {
      return res.status(409).json({ error: 'conflict', version: result.version });
    }
    res.json({ version: result.version, updatedAt: result.updatedAt });
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.get('/spec/resources/:resourceId', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const row = await getSpecResource(req.params.resourceId);
    if (!row) return res.status(404).json({ error: 'resource not found' });
    res.json(row);
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.post('/canvas/projects/:projectId/spec-resources/:resourceId/link', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const { kind } = req.body ?? {};
    await linkSpecResourceToProject(
      req.params.projectId,
      req.params.resourceId,
      kind,
    );
    res.json({ ok: true });
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.post(
  '/canvas/projects/:projectId/spec-resources/:resourceId/detach',
  async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const { newResourceId, filePath, contentHash, kind } = req.body ?? {};
      if (!newResourceId || !filePath || !contentHash) {
        return res.status(400).json({
          error: 'newResourceId, filePath, and contentHash required',
        });
      }
      const result = await detachSpecResourceForProject(
        req.params.projectId,
        req.params.resourceId,
        { newResourceId, filePath, contentHash, kind },
      );
      res.json(result);
    } catch (e) {
      sendClusterError(res, e);
    }
  },
);

app.get('/spec/notes/:noteId/links', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const rows = await listSpecNoteLinksForNote(req.params.noteId);
    res.json({ links: rows });
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.post('/spec/notes/:noteId/links', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const { resourceId, projectId } = req.body ?? {};
    if (!resourceId || !projectId) {
      return res.status(400).json({ error: 'resourceId and projectId required' });
    }
    await createSpecNoteLink(req.params.noteId, resourceId, projectId);
    res.json({ ok: true });
  } catch (e) {
    const status = e.statusCode === 400 ? 400 : dbErrorHttpStatus(e);
    res.status(status).json({ error: e.message });
  }
});

app.delete('/spec/notes/:noteId/links/:resourceId', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    await deleteSpecNoteLink(req.params.noteId, req.params.resourceId);
    res.json({ ok: true });
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.get('/canvas/agent-chat/:projectId/:connectorId/threads', async (req, res) => {
  try {
    const row = await getAgentChatThreadIndex(
      req.params.projectId,
      req.params.connectorId,
    );
    if (!row) return res.json({ index: null, updatedAt: null, revision: 0 });
    res.json({
      index: row.payload,
      updatedAt: row.updatedAt,
      revision: row.revision,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/canvas/agent-chat/:projectId/:connectorId/threads', async (req, res) => {
  try {
    const { index, expectedRevision } = req.body;
    if (!index || typeof index !== 'object') {
      return res.status(400).json({ error: 'index object required' });
    }
    if (expectedRevision === undefined || expectedRevision === null) {
      return res.status(400).json({ error: 'expectedRevision required' });
    }
    const result = await putAgentChatThreadIndex(
      req.params.projectId,
      req.params.connectorId,
      index,
      expectedRevision,
    );
    if (!result.ok) {
      return res.status(409).json({
        error: 'conflict',
        revision: result.revision,
        index: result.payload,
        updatedAt: result.updatedAt,
      });
    }
    res.json({ updatedAt: result.updatedAt, revision: result.revision });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/canvas/agent-chat/:projectId/:connectorId/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    if (threadId === 'threads') {
      return res.status(404).json({ error: 'not found' });
    }
    const row = await getAgentChatSession(
      req.params.projectId,
      req.params.connectorId,
      threadId,
    );
    if (!row) return res.json({ session: null, updatedAt: null, revision: 0 });
    res.json({
      session: row.payload,
      updatedAt: row.updatedAt,
      revision: row.revision,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/canvas/agent-chat/:projectId/:connectorId/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    if (threadId === 'threads') {
      return res.status(400).json({ error: 'invalid thread id' });
    }
    const { session, expectedRevision } = req.body;
    if (!session || typeof session !== 'object') {
      return res.status(400).json({ error: 'session object required' });
    }
    if (expectedRevision === undefined || expectedRevision === null) {
      return res.status(400).json({ error: 'expectedRevision required' });
    }
    const result = await putAgentChatSession(
      req.params.projectId,
      req.params.connectorId,
      session,
      threadId,
      expectedRevision,
    );
    if (!result.ok) {
      return res.status(409).json({
        error: 'conflict',
        revision: result.revision,
        session: result.payload,
        updatedAt: result.updatedAt,
      });
    }
    res.json({ updatedAt: result.updatedAt, revision: result.revision });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/canvas/agent-chat/:projectId/:connectorId/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    if (threadId === 'threads') {
      return res.status(400).json({ error: 'invalid thread id' });
    }
    await deleteAgentChatSession(
      req.params.projectId,
      req.params.connectorId,
      threadId,
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** @deprecated Legacy single-session routes (thread_id = legacy) */
app.get('/canvas/agent-chat/:projectId/:connectorId', async (req, res) => {
  try {
    const row = await getAgentChatSession(
      req.params.projectId,
      req.params.connectorId,
      LEGACY_THREAD_ID,
    );
    if (!row) return res.json({ session: null, updatedAt: null, revision: 0 });
    res.json({
      session: row.payload,
      updatedAt: row.updatedAt,
      revision: row.revision,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/canvas/agent-chat/:projectId/:connectorId', async (req, res) => {
  try {
    const { session, expectedRevision } = req.body;
    if (!session || typeof session !== 'object') {
      return res.status(400).json({ error: 'session object required' });
    }
    if (expectedRevision === undefined || expectedRevision === null) {
      return res.status(400).json({ error: 'expectedRevision required' });
    }
    const result = await putAgentChatSession(
      req.params.projectId,
      req.params.connectorId,
      session,
      LEGACY_THREAD_ID,
      expectedRevision,
    );
    if (!result.ok) {
      return res.status(409).json({
        error: 'conflict',
        revision: result.revision,
        session: result.payload,
        updatedAt: result.updatedAt,
      });
    }
    res.json({ updatedAt: result.updatedAt, revision: result.revision });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/canvas/agent-chat/:projectId/:connectorId', async (req, res) => {
  try {
    await deleteAgentChatSession(
      req.params.projectId,
      req.params.connectorId,
      LEGACY_THREAD_ID,
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/canvas/previews/:cacheKey', async (req, res) => {
  try {
    const cacheKey = decodeURIComponent(req.params.cacheKey);
    const row = await getPreviewBlob(cacheKey);
    if (!row) return res.status(404).json({ error: 'preview not found' });
    if (row.contentType) res.type(row.contentType);
    res.send(row.blob);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/canvas/previews/:cacheKey', async (req, res) => {
  try {
    const cacheKey = decodeURIComponent(req.params.cacheKey);
    const { projectId, contentType, data } = req.body;
    if (!projectId || !data) {
      return res.status(400).json({ error: 'projectId and base64 data required' });
    }
    const blob = Buffer.from(data, 'base64');
    const result = await putPreviewBlob(cacheKey, projectId, blob, contentType);
    res.json(result);
  } catch (e) {
    if (e.message.includes('byte limit')) {
      return res.status(413).json({ error: e.message });
    }
    res.status(500).json({ error: e.message });
  }
});

app.delete('/canvas/previews', async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: 'projectId query required' });
    await deletePreviewBlobsForProject(String(projectId));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/clusters', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const { projectId, name, parentClusterId, purpose, members } = req.body;
    const refs = (members || []).filter((m) => m?.id && m?.type);
    const isSubClusterCreate = Boolean(parentClusterId || (projectId && name?.trim() && refs.length > 0));

    if (isSubClusterCreate) {
      if (!name?.trim()) return res.status(400).json({ error: 'name required' });
      let resolvedParentId = parentClusterId;
      if (!resolvedParentId && projectId) {
        resolvedParentId = await resolveClusterId(projectId);
        if (!resolvedParentId) {
          const workspace = await getOrCreateClusterForProject(projectId, 'Project');
          resolvedParentId = workspace.id;
        }
      }
      if (!resolvedParentId) {
        return res.status(400).json({ error: 'parentClusterId or projectId required' });
      }
      const cluster = await createSubCluster({
        name,
        purpose: purpose ?? null,
        parentClusterId: resolvedParentId,
        members: refs,
      });
      return res.json({ cluster });
    }
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    const cluster = await getOrCreateClusterForProject(projectId, name || 'Project');
    res.json({ cluster });
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.get('/clusters/by-project/:projectId', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const clusterId = await resolveClusterId(req.params.projectId);
    if (!clusterId) return res.json({ clusterId: null });
    res.json({ clusterId });
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.get('/clusters/by-project/:projectId/subclusters', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const parentId = await resolveClusterId(req.params.projectId);
    if (!parentId) return res.json({ clusters: [] });
    const clusters = await listAllDescendantClusters(parentId);
    res.json({ clusters });
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.get('/clusters/:clusterId/members', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const members = await getClusterMembers(req.params.clusterId);
    res.json({ members });
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.post('/clusters/:clusterId/members', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const refs = req.body.members || req.body.refs || [];
    await addClusterMembers(req.params.clusterId, refs);
    const members = await getClusterMembers(req.params.clusterId);
    res.json({ members });
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.delete('/clusters/:clusterId/members', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const { id, type } = req.body;
    if (!id || !type) return res.status(400).json({ error: 'id and type required' });
    await removeClusterMember(req.params.clusterId, { id, type });
    res.json({ ok: true });
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.patch('/clusters/:clusterId', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const { name, purpose } = req.body;
    const cluster = await updateCluster(req.params.clusterId, { name, purpose });
    res.json({ cluster });
  } catch (e) {
    if (isDbConnectionError(e)) {
      return sendClusterError(res, e);
    }
    const status = e.message === 'cluster not found' ? 404 : 400;
    res.status(status).json({ error: e.message });
  }
});

app.delete('/clusters/:clusterId', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const cluster = await archiveSubCluster(req.params.clusterId);
    res.json({ cluster });
  } catch (e) {
    if (isDbConnectionError(e)) {
      return sendClusterError(res, e);
    }
    const status = e.message === 'cannot delete workspace cluster' ? 403 : 400;
    res.status(status).json({ error: e.message });
  }
});

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

app.get('/clusters/:clusterId/primitives', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const { type, limit } = req.query;
    const data = await listClusterPrimitives(req.params.clusterId, {
      type: type || undefined,
      limit: limit ? Number(limit) : 100,
    });
    res.json(data);
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.get('/clusters/:clusterId/events', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const { limit } = req.query;
    const data = await listClusterEvents(req.params.clusterId, {
      limit: limit ? Number(limit) : 200,
    });
    res.json(data);
  } catch (e) {
    sendClusterError(res, e);
  }
});

app.get('/primitives/:type/:id', async (req, res) => {
  try {
    const detail = await getPrimitiveDetail(req.params.type, req.params.id);
    if (!detail) return res.status(404).json({ error: 'not found' });
    res.json(detail);
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

app.get('/clusters/:clusterId/graph', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const graph = await buildClusterGraph(req.params.clusterId);
    res.json(graph);
  } catch (e) {
    sendClusterError(res, e);
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

app.get('/agent/health', async (_req, res) => {
  try {
    const openai = await checkOpenaiReachable();
    res.json({
      secretsConfigured: secretsAvailable(),
      openaiReachable: openai.reachable,
      openaiReachabilityError: openai.error ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/agent/connectors', async (_req, res) => {
  try {
    const connectors = await listConnectorStatus();
    res.json({ connectors, secretsConfigured: secretsAvailable() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/agent/credentials/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    if (!isAllowedProvider(provider)) {
      return res.status(400).json({ error: 'Unknown provider' });
    }
    if (!secretsAvailable()) {
      return res.status(503).json({
        error:
          'Server cannot store API keys. Ensure the API can write canvas/.data/agent-master.key or set AGENT_SECRETS_KEY.',
      });
    }
    const { apiKey } = req.body;
    const { keyHint } = await saveCredential(provider, apiKey);
    res.json({ ok: true, keyHint });
  } catch (e) {
    const status = e.message.includes('AGENT_SECRETS_KEY') ? 503 : 400;
    res.status(status).json({ error: e.message });
  }
});

app.delete('/agent/credentials/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    if (!isAllowedProvider(provider)) {
      return res.status(400).json({ error: 'Unknown provider' });
    }
    await deleteCredential(provider);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const AGENT_SYSTEM_CONTEXT_MAX_CHARS = 120_000;

app.post('/agent/estimate', async (req, res) => {
  try {
    const { provider, messages, systemContext } = req.body;
    if (!provider || !isAllowedProvider(provider)) {
      return res.status(400).json({ error: 'Unknown or missing provider' });
    }
    if (systemContext && String(systemContext).length > AGENT_SYSTEM_CONTEXT_MAX_CHARS) {
      return res.status(400).json({
        error: `Context is too large (${String(systemContext).length} characters). Select fewer items.`,
      });
    }
    const result = estimateChatInputTokens({
      provider,
      messages: messages || [],
      systemContext,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/agent/chat', async (req, res) => {
  try {
    const { provider, messages, systemContext } = req.body;
    if (!provider || !isAllowedProvider(provider)) {
      return res.status(400).json({ error: 'Unknown or missing provider' });
    }
    if (systemContext && String(systemContext).length > AGENT_SYSTEM_CONTEXT_MAX_CHARS) {
      return res.status(400).json({
        error: `Context is too large (${String(systemContext).length} characters). Select fewer items.`,
      });
    }
    const apiKey = await getDecryptedApiKey(provider);
    if (!apiKey) {
      return res.status(400).json({ error: 'API key not configured for this agent' });
    }
    const result = await completeChat({
      apiKey,
      provider,
      messages: messages || [],
      systemContext,
    });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

async function start() {
  try {
    await runMigrations();
    resolveMasterKey();
    dbReady = true;
  } catch (e) {
    dbReady = false;
    console.warn(
      'Database unavailable — API started in limited mode (bookmark preview works; project sync and clusters need Postgres).',
      formatDbError(e),
    );
  }

  app.listen(PORT, () => {
    console.log(`Canvas primitives API http://localhost:${PORT}${dbReady ? '' : ' (limited — no database)'}`);
  });
}

start();

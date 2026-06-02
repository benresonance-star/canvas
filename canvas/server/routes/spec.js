import {
  getSpecCanvasState,
  putSpecCanvasState,
  emptySpecCanvasState,
} from '../repositories/spec-canvas-state.js';
import {
  getSpecResource,
  detachSpecResourceForProject,
  linkSpecResourceToProject,
} from '../repositories/spec-resources.js';
import {
  createSpecNoteLink,
  deleteSpecNoteLink,
  listSpecNoteLinksForNote,
} from '../repositories/spec-note-links.js';
import { dbErrorHttpStatus } from '../lib/dbError.js';

/** @param {import('express').Express} app @param {{ requireDb: (res: import('express').Response) => boolean, sendClusterError: Function }} deps */
export function registerSpecRoutes(app, { requireDb, sendClusterError }) {
  app.get('/canvas/projects/:projectId/spec-canvas', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const row = await getSpecCanvasState(req.params.projectId);
      res.json(row ?? emptySpecCanvasState());
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
}

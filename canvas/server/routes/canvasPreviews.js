import {
  getPreviewBlob,
  putPreviewBlob,
  deletePreviewBlobsForProject,
} from '../repositories/canvas-previews.js';

/** @param {import('express').Express} app */
export function registerCanvasPreviewRoutes(app) {
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
}

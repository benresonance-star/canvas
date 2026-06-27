import {
  createMusicAgent,
  createSketchCluster,
  getMusicAgent,
  getOrCreateProjectTransport,
  getOrCreateProjectDescriptorGraph,
  getOrCreateProjectSpaceState,
  getSonicSketch,
  getSonicSketchForAgent,
  listMusicAgents,
  listChronicleEvents,
  listMusicPresets,
  listSketchClusters,
  listSonicSketches,
  listTemporalSketches,
  listMusicVersions,
  deleteMusicPreset,
  getMusicPreset,
  importMusicAgentPackage,
  recordChronicleEvent,
  recordMusicImportExport,
  restoreMusicAgent,
  restoreMusicVersion,
  saveMusicPreset,
  saveMusicVersion,
  saveProjectDescriptorGraph,
  saveProjectSpaceState,
  saveSketchDescriptorGraph,
  softDeleteMusicAgent,
  updateMusicAgent,
  updateProjectTransport,
  upsertSonicSketch,
  upsertTemporalSketch,
  upsertMusicBlackboard,
} from '../repositories/music.js';
import { createDefaultTransportState } from '../../packages/music-core/src/index.js';
import { createMusicArtifactManifest } from '../../packages/music-core/src/index.js';

export function registerMusicRoutes(app, { requireDb, sendClusterError }) {
  app.get('/music/projects/:projectId/transport', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const transport = await getOrCreateProjectTransport(
        req.params.projectId,
        createDefaultTransportState({ projectId: req.params.projectId }),
      );
      res.json({ transport });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.patch('/music/projects/:projectId/transport', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const transport = await updateProjectTransport(req.params.projectId, req.body?.state ?? {});
      res.json({ transport });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.post('/music/projects/:projectId/agents', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await createMusicAgent(req.params.projectId, req.body ?? {});
      res.status(201).json({ agent });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/music/projects/:projectId/agents', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agents = await listMusicAgents(req.params.projectId);
      res.json({ agents });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/music/agents/:agentId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await getMusicAgent(req.params.agentId);
      if (!agent) return res.status(404).json({ error: 'music agent not found' });
      res.json({ agent });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.patch('/music/agents/:agentId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await updateMusicAgent(req.params.agentId, req.body ?? {});
      if (!agent) return res.status(404).json({ error: 'music agent not found' });
      res.json({ agent });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.delete('/music/agents/:agentId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await softDeleteMusicAgent(req.params.agentId);
      if (!agent) return res.status(404).json({ error: 'music agent not found' });
      res.json({ agent });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.post('/music/agents/:agentId/restore', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await restoreMusicAgent(req.params.agentId);
      if (!agent) return res.status(404).json({ error: 'music agent not found' });
      res.json({ agent });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.post('/music/projects/:projectId/presets', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const preset = await saveMusicPreset(req.params.projectId, req.body ?? {});
      res.status(201).json({ preset });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/music/projects/:projectId/presets', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const presets = await listMusicPresets(req.params.projectId);
      res.json({ presets });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/music/presets/:presetId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const preset = await getMusicPreset(req.params.presetId);
      if (!preset) return res.status(404).json({ error: 'music preset not found' });
      res.json({ preset });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.delete('/music/presets/:presetId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const preset = await deleteMusicPreset(req.params.presetId);
      if (!preset) return res.status(404).json({ error: 'music preset not found' });
      res.json({ preset });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.post('/music/agents/:agentId/versions', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const version = await saveMusicVersion(req.params.agentId, req.body ?? {});
      res.status(201).json({ version });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/music/agents/:agentId/versions', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const versions = await listMusicVersions(req.params.agentId);
      res.json({ versions });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.post('/music/agents/:agentId/restore-version/:versionId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await restoreMusicVersion(req.params.agentId, req.params.versionId);
      if (!agent) return res.status(404).json({ error: 'music version not found' });
      res.json({ agent });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.post('/music/agents/:agentId/export', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await getMusicAgent(req.params.agentId);
      if (!agent) return res.status(404).json({ error: 'music agent not found' });
      const manifest = createMusicArtifactManifest({
        agentType: agent.agentType,
        sourceProjectId: agent.projectId,
        sourceAgentId: agent.id,
        files: [
          { path: 'agent.json', kind: 'agent-state' },
          { path: 'patterns/current.pattern.json', kind: 'pattern' },
        ],
      });
      const record = await recordMusicImportExport(agent.projectId, {
        agentId: agent.id,
        direction: 'export',
        manifest,
        filePath: agent.filePath,
      });
      res.json({
        record,
        package: {
          manifest,
          files: {
            'manifest.json': manifest,
            'agent.json': agent,
            'patterns/current.pattern.json': agent.state?.pattern,
          },
        },
      });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.post('/music/projects/:projectId/import', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const agent = await importMusicAgentPackage(req.params.projectId, req.body?.package ?? req.body);
      res.status(201).json({ agent });
    } catch (error) {
      sendClusterError(res, error, { validation: true });
    }
  });

  app.put('/music/projects/:projectId/blackboard', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const blackboard = await upsertMusicBlackboard(req.params.projectId, req.body?.state ?? {});
      res.json({ blackboard });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/music/projects/:projectId/sketch-clusters', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const clusters = await listSketchClusters(req.params.projectId);
      res.json({ clusters });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.post('/music/projects/:projectId/sketch-clusters', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const cluster = await createSketchCluster(req.params.projectId, req.body ?? {});
      res.status(201).json({ cluster });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/music/projects/:projectId/sketches', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const sketches = await listSonicSketches(req.params.projectId);
      res.json({ sketches });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.post('/music/projects/:projectId/sketches', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const sketch = await upsertSonicSketch(req.params.projectId, req.body ?? {});
      res.status(201).json({ sketch });
    } catch (error) {
      sendClusterError(res, error, { validation: true });
    }
  });

  app.get('/music/sketches/:sketchId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const sketch = await getSonicSketch(req.params.sketchId);
      if (!sketch) return res.status(404).json({ error: 'music sketch not found' });
      res.json({ sketch });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.patch('/music/sketches/:sketchId', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const existing = await getSonicSketch(req.params.sketchId);
      if (!existing) return res.status(404).json({ error: 'music sketch not found' });
      const sketch = await upsertSonicSketch(existing.projectId, { ...existing, ...req.body, id: existing.id });
      res.json({ sketch });
    } catch (error) {
      sendClusterError(res, error, { validation: true });
    }
  });

  app.get('/music/agents/:agentId/sketch', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const sketch = await getSonicSketchForAgent(req.params.agentId);
      res.json({ sketch });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.get('/music/projects/:projectId/descriptor-graph', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const descriptorGraph = await getOrCreateProjectDescriptorGraph(req.params.projectId);
      res.json(descriptorGraph);
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.put('/music/projects/:projectId/descriptor-graph', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const descriptorGraph = await saveProjectDescriptorGraph(
        req.params.projectId,
        req.body?.descriptorGraph ?? req.body,
      );
      res.json(descriptorGraph);
    } catch (error) {
      sendClusterError(res, error, { validation: true });
    }
  });

  app.put('/music/sketches/:sketchId/descriptor-graph', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const sketch = await saveSketchDescriptorGraph(
        req.params.sketchId,
        req.body?.descriptorGraph ?? req.body,
      );
      if (!sketch) return res.status(404).json({ error: 'music sketch not found' });
      res.json({ sketch });
    } catch (error) {
      sendClusterError(res, error, { validation: true });
    }
  });

  app.get('/music/projects/:projectId/space', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const space = await getOrCreateProjectSpaceState(req.params.projectId);
      res.json({ space });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.put('/music/projects/:projectId/space', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const space = await saveProjectSpaceState(req.params.projectId, req.body?.state ?? req.body);
      res.json({ space });
    } catch (error) {
      sendClusterError(res, error, { validation: true });
    }
  });

  app.get('/music/projects/:projectId/temporal-sketches', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const temporalSketches = await listTemporalSketches(
        req.params.projectId,
        req.query.sketchId ? String(req.query.sketchId) : null,
      );
      res.json({ temporalSketches });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.post('/music/projects/:projectId/temporal-sketches', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const temporalSketch = await upsertTemporalSketch(req.params.projectId, req.body ?? {});
      res.status(201).json({ temporalSketch });
    } catch (error) {
      sendClusterError(res, error, { validation: true });
    }
  });

  app.get('/music/projects/:projectId/chronicle', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const events = await listChronicleEvents(req.params.projectId, {
        sketchId: req.query.sketchId ? String(req.query.sketchId) : null,
        limit: req.query.limit,
      });
      res.json({ events });
    } catch (error) {
      sendClusterError(res, error);
    }
  });

  app.post('/music/projects/:projectId/chronicle', async (req, res) => {
    if (!requireDb(res)) return;
    try {
      const event = await recordChronicleEvent(req.params.projectId, req.body ?? {});
      res.status(201).json({ event });
    } catch (error) {
      sendClusterError(res, error, { validation: true });
    }
  });
}

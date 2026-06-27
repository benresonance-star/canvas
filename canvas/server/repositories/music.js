import crypto from 'node:crypto';
import { pool, query } from '../db.js';
import { newUlid } from '../../src/primitives/shared/ulid.js';
import {
  createDefaultDescriptorGraph,
  createDefaultSonicSketch,
  createDefaultSpaceState,
  createDefaultTemporalState,
} from '../../packages/music-core/src/index.js';

function artifactHash(id) {
  return crypto.createHash('sha256').update(`canvas-music:${id}`).digest('hex');
}

function mapAgent(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    artifactId: row.artifact_id,
    agentType: row.agent_type,
    name: row.name,
    description: row.description,
    status: row.status,
    state: row.state,
    filePath: row.file_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapTransport(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPreset(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    agentId: row.agent_id,
    agentType: row.agent_type,
    name: row.name,
    description: row.description,
    tags: row.tags ?? [],
    preset: row.preset,
    isFavorite: row.is_favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row) {
  if (!row) return null;
  return {
    id: row.id,
    agentId: row.agent_id,
    parentVersionId: row.parent_version_id,
    versionType: row.version_type,
    name: row.name,
    snapshot: row.snapshot,
    aiExplanation: row.ai_explanation,
    createdAt: row.created_at,
  };
}

function mapSketchCluster(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    semantics: row.semantics,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSketch(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    clusterId: row.cluster_id,
    agentId: row.agent_id,
    sketchType: row.sketch_type,
    name: row.name,
    description: row.description,
    state: row.state,
    descriptorGraph: row.descriptor_graph,
    spaceState: row.space_state,
    temporalState: row.temporal_state,
    moments: row.moments ?? [],
    variations: row.variations ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChronicleEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    sketchId: row.sketch_id,
    agentId: row.agent_id,
    eventType: row.event_type,
    actorType: row.actor_type,
    summary: row.summary,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

function mapTemporalSketch(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    sketchId: row.sketch_id,
    name: row.name,
    topology: row.topology,
    state: row.state,
    descriptorMappings: row.descriptor_mappings,
    automation: row.automation ?? [],
    variations: row.variations ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOrCreateProjectTransport(projectId, defaultState) {
  const existing = await query(
    'SELECT * FROM music_transport WHERE project_id = $1 AND deleted_at IS NULL',
    [projectId],
  );
  if (existing.rows[0]) return mapTransport(existing.rows[0]);
  const id = newUlid();
  const inserted = await query(
    `INSERT INTO music_transport (id, project_id, state)
     VALUES ($1, $2, $3::jsonb)
     RETURNING *`,
    [id, projectId, JSON.stringify({ ...defaultState, id, projectId })],
  );
  return mapTransport(inserted.rows[0]);
}

export async function updateProjectTransport(projectId, state) {
  const updated = await query(
    `UPDATE music_transport
     SET state = $2::jsonb, updated_at = NOW()
     WHERE project_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [projectId, JSON.stringify(state)],
  );
  return mapTransport(updated.rows[0]);
}

export async function createMusicAgent(projectId, input) {
  const id = newUlid();
  const artifactId = id;
  const safeName = String(input.name ?? 'Beat Agent').trim() || 'Beat Agent';
  const agentType = String(input.agentType ?? 'beat').trim() || 'beat';
  const state = input.state ?? {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO artifact
       (id, type, uri, content_hash, version, source_authority, retrieved_at, payload_text, metadata)
       VALUES ($1, 'music-agent', $2, $3, '1', 'canvas.music', NOW(), NULL, $4::jsonb)`,
      [
        artifactId,
        `music-agent:${id}`,
        artifactHash(id),
        JSON.stringify({ title: safeName, project_id: projectId, agent_type: agentType }),
      ],
    );
    const agent = await client.query(
      `INSERT INTO music_agent
       (id, project_id, artifact_id, agent_type, name, description, status, state, file_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       RETURNING *`,
      [
        id,
        projectId,
        artifactId,
        agentType,
        safeName,
        String(input.description ?? ''),
        input.status ?? 'draft',
        JSON.stringify(state),
        input.filePath ?? `music/${agentType}-agent-${id}`,
      ],
    );
    const sketchId = newUlid();
    const sketch = createDefaultSonicSketch({
      id: sketchId,
      projectId,
      agentId: id,
      sketchType: agentType,
      name: safeName,
      description: String(input.description ?? ''),
      state,
      descriptorGraph: input.descriptorGraph,
      spaceState: input.spaceState,
      temporalState: input.temporalState,
    });
    await client.query(
      `INSERT INTO music_sketch
       (id, project_id, agent_id, sketch_type, name, description, state, descriptor_graph, space_state, temporal_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        sketchId,
        projectId,
        id,
        agentType,
        safeName,
        String(input.description ?? ''),
        JSON.stringify(sketch.state),
        JSON.stringify(sketch.descriptorGraph),
        JSON.stringify(sketch.spaceState),
        JSON.stringify(sketch.temporalState),
      ],
    );
    await client.query(
      `INSERT INTO music_chronicle_event
       (id, project_id, sketch_id, agent_id, event_type, actor_type, summary, payload)
       VALUES ($1,$2,$3,$4,'sketch.created','system',$5,$6::jsonb)`,
      [
        newUlid(),
        projectId,
        sketchId,
        id,
        `Created ${agentType} sketch ${safeName}`,
        JSON.stringify({ agentType, name: safeName }),
      ],
    );
    await client.query(
      `INSERT INTO cluster_member (cluster_id, primitive_id, primitive_type, added_at)
       SELECT cluster_id, $2, 'artifact', NOW()
       FROM project_cluster WHERE project_id = $1
       ON CONFLICT DO NOTHING`,
      [projectId, artifactId],
    );
    await client.query('COMMIT');
    return mapAgent(agent.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listMusicAgents(projectId, { includeDeleted = false } = {}) {
  const res = await query(
    `SELECT * FROM music_agent
     WHERE project_id = $1 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
     ORDER BY updated_at DESC`,
    [projectId],
  );
  return res.rows.map(mapAgent);
}

export async function getMusicAgent(agentId) {
  const res = await query('SELECT * FROM music_agent WHERE id = $1', [agentId]);
  return mapAgent(res.rows[0]);
}

export async function updateMusicAgent(agentId, patch) {
  const existing = await getMusicAgent(agentId);
  if (!existing) return null;
  const nextState = patch.state === undefined ? existing.state : patch.state;
  const updated = await query(
    `UPDATE music_agent
     SET name = $2, description = $3, status = $4, state = $5::jsonb,
         file_path = $6, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      agentId,
      patch.name ?? existing.name,
      patch.description ?? existing.description,
      patch.status ?? existing.status,
      JSON.stringify(nextState),
      patch.filePath ?? existing.filePath,
    ],
  );
  await query(
    `UPDATE music_sketch
     SET name = $2, description = $3, state = $4::jsonb, updated_at = NOW()
     WHERE agent_id = $1 AND deleted_at IS NULL`,
    [
      agentId,
      patch.name ?? existing.name,
      patch.description ?? existing.description,
      JSON.stringify(nextState),
    ],
  );
  await recordChronicleEvent(existing.projectId, {
    agentId,
    eventType: patch.chronicleEventType ?? 'agent.updated',
    actorType: patch.actorType ?? 'human',
    summary: patch.summary ?? `Updated ${patch.name ?? existing.name}`,
    payload: { status: patch.status ?? existing.status },
  });
  return mapAgent(updated.rows[0]);
}

export async function softDeleteMusicAgent(agentId) {
  const res = await query(
    `UPDATE music_agent
     SET deleted_at = NOW(), status = 'deleted', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [agentId],
  );
  return mapAgent(res.rows[0]);
}

export async function restoreMusicAgent(agentId) {
  const res = await query(
    `UPDATE music_agent
     SET deleted_at = NULL, status = 'draft', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [agentId],
  );
  return mapAgent(res.rows[0]);
}

export async function saveMusicPreset(projectId, input) {
  const id = input.id ?? newUlid();
  const res = await query(
    `INSERT INTO music_preset
     (id, project_id, agent_id, agent_type, name, description, tags, preset, is_favorite)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       tags = EXCLUDED.tags,
       preset = EXCLUDED.preset,
       is_favorite = EXCLUDED.is_favorite,
       updated_at = NOW(),
       deleted_at = NULL
     RETURNING *`,
    [
      id,
      projectId,
      input.agentId ?? null,
      input.agentType ?? 'beat',
      String(input.name ?? 'Preset'),
      String(input.description ?? ''),
      input.tags ?? [],
      JSON.stringify(input.preset ?? {}),
      input.isFavorite === true,
    ],
  );
  return mapPreset(res.rows[0]);
}

export async function listMusicPresets(projectId) {
  const res = await query(
    `SELECT * FROM music_preset
     WHERE project_id = $1 AND deleted_at IS NULL
     ORDER BY is_favorite DESC, updated_at DESC`,
    [projectId],
  );
  return res.rows.map(mapPreset);
}

export async function getMusicPreset(presetId) {
  const res = await query(
    'SELECT * FROM music_preset WHERE id = $1 AND deleted_at IS NULL',
    [presetId],
  );
  return mapPreset(res.rows[0]);
}

export async function deleteMusicPreset(presetId) {
  const res = await query(
    `UPDATE music_preset
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [presetId],
  );
  return mapPreset(res.rows[0]);
}

export async function saveMusicVersion(agentId, input) {
  const id = newUlid();
  const res = await query(
    `INSERT INTO music_version
     (id, agent_id, parent_version_id, version_type, name, snapshot, ai_explanation)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
     RETURNING *`,
    [
      id,
      agentId,
      input.parentVersionId ?? null,
      input.versionType ?? 'manual',
      input.name ?? 'Snapshot',
      JSON.stringify(input.snapshot ?? {}),
      input.aiExplanation ?? null,
    ],
  );
  return mapVersion(res.rows[0]);
}

export async function listMusicVersions(agentId) {
  const res = await query(
    `SELECT * FROM music_version
     WHERE agent_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [agentId],
  );
  return res.rows.map(mapVersion);
}

export async function getMusicVersion(versionId) {
  const res = await query(
    'SELECT * FROM music_version WHERE id = $1 AND deleted_at IS NULL',
    [versionId],
  );
  return mapVersion(res.rows[0]);
}

export async function restoreMusicVersion(agentId, versionId) {
  const version = await getMusicVersion(versionId);
  if (!version || version.agentId !== agentId) return null;
  const agent = await updateMusicAgent(agentId, {
    state: version.snapshot,
    name: version.snapshot?.name,
    status: version.snapshot?.status ?? 'draft',
  });
  await saveMusicVersion(agentId, {
    parentVersionId: versionId,
    versionType: 'restore',
    name: `Restored ${version.name}`,
    snapshot: agent.state,
  });
  return agent;
}

export async function upsertMusicBlackboard(projectId, state) {
  const res = await query(
    `INSERT INTO music_blackboard (project_id, state, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (project_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
     RETURNING *`,
    [projectId, JSON.stringify(state ?? {})],
  );
  return {
    projectId: res.rows[0].project_id,
    state: res.rows[0].state,
    updatedAt: res.rows[0].updated_at,
  };
}

export async function recordMusicImportExport(projectId, input) {
  const id = newUlid();
  const res = await query(
    `INSERT INTO music_import_export
     (id, project_id, agent_id, direction, manifest, file_path)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6)
     RETURNING *`,
    [
      id,
      projectId,
      input.agentId ?? null,
      input.direction,
      JSON.stringify(input.manifest ?? {}),
      input.filePath ?? null,
    ],
  );
  const row = res.rows[0];
  return {
    id: row.id,
    projectId: row.project_id,
    agentId: row.agent_id,
    direction: row.direction,
    manifest: row.manifest,
    filePath: row.file_path,
    createdAt: row.created_at,
  };
}

export async function importMusicAgentPackage(projectId, pkg) {
  const agentPayload = pkg?.files?.['agent.json'] ?? pkg?.agent ?? null;
  const manifest = pkg?.manifest ?? pkg?.files?.['manifest.json'] ?? {};
  if (!agentPayload?.state && !agentPayload?.musicState) {
    throw new Error('package does not contain agent state');
  }
  const imported = await createMusicAgent(projectId, {
    agentType: manifest.agentType ?? agentPayload.agentType ?? 'beat',
    name: `${agentPayload.name ?? 'Imported Beat Agent'} Copy`,
    description: agentPayload.description ?? '',
    status: 'draft',
    state: agentPayload.state ?? agentPayload.musicState,
  });
  await recordMusicImportExport(projectId, {
    agentId: imported.id,
    direction: 'import',
    manifest,
    filePath: imported.filePath,
  });
  return imported;
}

export async function createSketchCluster(projectId, input = {}) {
  const id = input.id ?? newUlid();
  const res = await query(
    `INSERT INTO music_sketch_cluster (id, project_id, name, description, semantics)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       semantics = EXCLUDED.semantics,
       updated_at = NOW(),
       deleted_at = NULL
     RETURNING *`,
    [
      id,
      projectId,
      String(input.name ?? 'Sketch Cluster'),
      String(input.description ?? ''),
      JSON.stringify(input.semantics ?? {}),
    ],
  );
  await recordChronicleEvent(projectId, {
    eventType: 'cluster.saved',
    summary: `Saved sketch cluster ${res.rows[0].name}`,
    payload: { clusterId: id },
  });
  return mapSketchCluster(res.rows[0]);
}

export async function listSketchClusters(projectId) {
  const res = await query(
    `SELECT * FROM music_sketch_cluster
     WHERE project_id = $1 AND deleted_at IS NULL
     ORDER BY updated_at DESC`,
    [projectId],
  );
  return res.rows.map(mapSketchCluster);
}

export async function listSonicSketches(projectId) {
  const res = await query(
    `SELECT * FROM music_sketch
     WHERE project_id = $1 AND deleted_at IS NULL
     ORDER BY updated_at DESC`,
    [projectId],
  );
  return res.rows.map(mapSketch);
}

export async function getSonicSketch(sketchId) {
  const res = await query(
    'SELECT * FROM music_sketch WHERE id = $1 AND deleted_at IS NULL',
    [sketchId],
  );
  return mapSketch(res.rows[0]);
}

export async function getSonicSketchForAgent(agentId) {
  const res = await query(
    `SELECT * FROM music_sketch
     WHERE agent_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
    [agentId],
  );
  return mapSketch(res.rows[0]);
}

export async function upsertSonicSketch(projectId, input = {}) {
  const id = input.id ?? newUlid();
  const sketch = createDefaultSonicSketch({ ...input, id, projectId });
  const res = await query(
    `INSERT INTO music_sketch
     (id, project_id, cluster_id, agent_id, sketch_type, name, description, state,
      descriptor_graph, space_state, temporal_state, moments, variations)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       cluster_id = EXCLUDED.cluster_id,
       agent_id = EXCLUDED.agent_id,
       sketch_type = EXCLUDED.sketch_type,
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       state = EXCLUDED.state,
       descriptor_graph = EXCLUDED.descriptor_graph,
       space_state = EXCLUDED.space_state,
       temporal_state = EXCLUDED.temporal_state,
       moments = EXCLUDED.moments,
       variations = EXCLUDED.variations,
       updated_at = NOW(),
       deleted_at = NULL
     RETURNING *`,
    [
      id,
      projectId,
      sketch.clusterId,
      sketch.agentId,
      sketch.sketchType,
      sketch.name,
      sketch.description,
      JSON.stringify(sketch.state),
      JSON.stringify(sketch.descriptorGraph),
      JSON.stringify(sketch.spaceState),
      JSON.stringify(sketch.temporalState),
      JSON.stringify(sketch.moments),
      JSON.stringify(sketch.variations),
    ],
  );
  await recordChronicleEvent(projectId, {
    sketchId: id,
    agentId: sketch.agentId,
    eventType: input.id ? 'sketch.updated' : 'sketch.created',
    actorType: input.actorType ?? 'human',
    summary: input.id ? `Updated sketch ${sketch.name}` : `Created sketch ${sketch.name}`,
    payload: { sketchType: sketch.sketchType },
  });
  return mapSketch(res.rows[0]);
}

export async function getOrCreateProjectDescriptorGraph(projectId) {
  const existing = await query(
    'SELECT * FROM music_project_descriptor_graph WHERE project_id = $1',
    [projectId],
  );
  if (existing.rows[0]) {
    return {
      projectId,
      descriptorGraph: createDefaultDescriptorGraph(existing.rows[0].descriptor_graph),
      updatedAt: existing.rows[0].updated_at,
    };
  }
  const descriptorGraph = createDefaultDescriptorGraph();
  const inserted = await query(
    `INSERT INTO music_project_descriptor_graph (project_id, descriptor_graph)
     VALUES ($1,$2::jsonb)
     RETURNING *`,
    [projectId, JSON.stringify(descriptorGraph)],
  );
  return {
    projectId,
    descriptorGraph: inserted.rows[0].descriptor_graph,
    updatedAt: inserted.rows[0].updated_at,
  };
}

export async function saveProjectDescriptorGraph(projectId, descriptorGraph) {
  const normalized = createDefaultDescriptorGraph(descriptorGraph);
  const res = await query(
    `INSERT INTO music_project_descriptor_graph (project_id, descriptor_graph, updated_at)
     VALUES ($1,$2::jsonb,NOW())
     ON CONFLICT (project_id) DO UPDATE SET
       descriptor_graph = EXCLUDED.descriptor_graph,
       updated_at = NOW()
     RETURNING *`,
    [projectId, JSON.stringify(normalized)],
  );
  await recordChronicleEvent(projectId, {
    eventType: 'descriptor.updated',
    summary: 'Updated descriptor graph',
    payload: { descriptors: Object.keys(normalized.descriptors) },
  });
  return {
    projectId,
    descriptorGraph: res.rows[0].descriptor_graph,
    updatedAt: res.rows[0].updated_at,
  };
}

export async function saveSketchDescriptorGraph(sketchId, descriptorGraph) {
  const normalized = createDefaultDescriptorGraph(descriptorGraph);
  const res = await query(
    `UPDATE music_sketch
     SET descriptor_graph = $2::jsonb, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [sketchId, JSON.stringify(normalized)],
  );
  const sketch = mapSketch(res.rows[0]);
  if (sketch) {
    await recordChronicleEvent(sketch.projectId, {
      sketchId,
      agentId: sketch.agentId,
      eventType: 'descriptor.updated',
      summary: `Updated descriptors for ${sketch.name}`,
      payload: { sketchId },
    });
  }
  return sketch;
}

export async function getOrCreateProjectSpaceState(projectId) {
  const existing = await query(
    'SELECT * FROM music_project_space_state WHERE project_id = $1',
    [projectId],
  );
  if (existing.rows[0]) {
    return {
      projectId,
      state: createDefaultSpaceState(existing.rows[0].state),
      updatedAt: existing.rows[0].updated_at,
    };
  }
  const state = createDefaultSpaceState();
  const inserted = await query(
    `INSERT INTO music_project_space_state (project_id, state)
     VALUES ($1,$2::jsonb)
     RETURNING *`,
    [projectId, JSON.stringify(state)],
  );
  return { projectId, state: inserted.rows[0].state, updatedAt: inserted.rows[0].updated_at };
}

export async function saveProjectSpaceState(projectId, state) {
  const normalized = createDefaultSpaceState(state);
  const res = await query(
    `INSERT INTO music_project_space_state (project_id, state, updated_at)
     VALUES ($1,$2::jsonb,NOW())
     ON CONFLICT (project_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
     RETURNING *`,
    [projectId, JSON.stringify(normalized)],
  );
  await recordChronicleEvent(projectId, {
    eventType: 'space.updated',
    summary: `Updated acoustic space ${normalized.roomIdentity}`,
    payload: { roomIdentity: normalized.roomIdentity },
  });
  return { projectId, state: res.rows[0].state, updatedAt: res.rows[0].updated_at };
}

export async function upsertTemporalSketch(projectId, input = {}) {
  const id = input.id ?? newUlid();
  const state = createDefaultTemporalState(input.state ?? { topology: input.topology });
  const res = await query(
    `INSERT INTO music_temporal_sketch
     (id, project_id, sketch_id, name, topology, state, descriptor_mappings, automation, variations)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       sketch_id = EXCLUDED.sketch_id,
       name = EXCLUDED.name,
       topology = EXCLUDED.topology,
       state = EXCLUDED.state,
       descriptor_mappings = EXCLUDED.descriptor_mappings,
       automation = EXCLUDED.automation,
       variations = EXCLUDED.variations,
       updated_at = NOW(),
       deleted_at = NULL
     RETURNING *`,
    [
      id,
      projectId,
      input.sketchId ?? null,
      String(input.name ?? `${state.topology} Temporal Sketch`),
      state.topology,
      JSON.stringify(state),
      JSON.stringify(input.descriptorMappings ?? {}),
      JSON.stringify(input.automation ?? state.automation ?? []),
      JSON.stringify(input.variations ?? state.variations ?? []),
    ],
  );
  await recordChronicleEvent(projectId, {
    sketchId: input.sketchId,
    eventType: input.id ? 'temporal.updated' : 'temporal.created',
    summary: `Saved ${state.topology} temporal sketch`,
    payload: { temporalSketchId: id, topology: state.topology },
  });
  return mapTemporalSketch(res.rows[0]);
}

export async function listTemporalSketches(projectId, sketchId = null) {
  const res = await query(
    `SELECT * FROM music_temporal_sketch
     WHERE project_id = $1 AND deleted_at IS NULL
       AND ($2::text IS NULL OR sketch_id = $2)
     ORDER BY updated_at DESC`,
    [projectId, sketchId],
  );
  return res.rows.map(mapTemporalSketch);
}

export async function recordChronicleEvent(projectId, input = {}) {
  const id = input.id ?? newUlid();
  const res = await query(
    `INSERT INTO music_chronicle_event
     (id, project_id, sketch_id, agent_id, event_type, actor_type, summary, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING *`,
    [
      id,
      projectId,
      input.sketchId ?? null,
      input.agentId ?? null,
      String(input.eventType ?? 'event'),
      String(input.actorType ?? 'system'),
      String(input.summary ?? ''),
      JSON.stringify(input.payload ?? {}),
    ],
  );
  return mapChronicleEvent(res.rows[0]);
}

export async function listChronicleEvents(projectId, { sketchId = null, limit = 80 } = {}) {
  const res = await query(
    `SELECT * FROM music_chronicle_event
     WHERE project_id = $1 AND ($2::text IS NULL OR sketch_id = $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [projectId, sketchId, Math.max(1, Math.min(200, Number(limit) || 80))],
  );
  return res.rows.map(mapChronicleEvent);
}

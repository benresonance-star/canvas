import { createDefaultDescriptorGraph } from '../descriptors/descriptorGraph.js';
import { createDefaultSpaceState } from '../space/acousticSpaceEngine.js';
import { createDefaultTemporalState } from '../temporal/temporalEngine.js';

export function createDefaultSonicSketch(overrides = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: overrides.id ?? null,
    projectId: overrides.projectId ?? null,
    clusterId: overrides.clusterId ?? null,
    agentId: overrides.agentId ?? null,
    sketchType: overrides.sketchType ?? overrides.agentType ?? 'beat',
    name: overrides.name ?? 'Untitled Sketch',
    description: overrides.description ?? '',
    state: overrides.state ?? {},
    descriptorGraph: createDefaultDescriptorGraph(overrides.descriptorGraph),
    spaceState: createDefaultSpaceState(overrides.spaceState),
    temporalState: createDefaultTemporalState(overrides.temporalState),
    moments: Array.isArray(overrides.moments) ? overrides.moments : [],
    variations: Array.isArray(overrides.variations) ? overrides.variations : [],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

export function createSketchMoment(input = {}) {
  return {
    id: input.id ?? `moment-${Date.now()}`,
    name: input.name ?? 'Moment',
    transportTick: Number.isFinite(input.transportTick) ? input.transportTick : 0,
    descriptorSnapshot: input.descriptorSnapshot ?? null,
    stateSnapshot: input.stateSnapshot ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function createSketchVariation(input = {}) {
  return {
    id: input.id ?? `variation-${Date.now()}`,
    name: input.name ?? 'Variation',
    kind: input.kind ?? 'manual',
    state: input.state ?? {},
    descriptorGraph: input.descriptorGraph ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

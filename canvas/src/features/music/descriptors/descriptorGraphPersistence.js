import {
  createDefaultDescriptorGraph,
  createDefaultSpaceState,
} from '../../../../packages/music-core/src/index.js';

export function descriptorGraphTimestamp(graph) {
  const value = Date.parse(graph?.updatedAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

/**
 * Pick the newest descriptor graph from one or more partial sources.
 * @param {...import('../../../../packages/music-core/src/index.js').DescriptorGraph | null | undefined} candidates
 */
export function pickNewestDescriptorGraph(...candidates) {
  let best = null;
  let bestTimestamp = -1;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = createDefaultDescriptorGraph(candidate);
    const timestamp = descriptorGraphTimestamp(normalized);
    if (timestamp >= bestTimestamp) {
      bestTimestamp = timestamp;
      best = normalized;
    }
  }
  return best ?? createDefaultDescriptorGraph();
}

export function spaceStateTimestamp(spaceState) {
  const value = Date.parse(spaceState?.updatedAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

export function pickNewestSpaceState(...candidates) {
  let best = null;
  let bestTimestamp = -1;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = createDefaultSpaceState(candidate);
    const timestamp = spaceStateTimestamp(normalized);
    if (timestamp >= bestTimestamp) {
      bestTimestamp = timestamp;
      best = normalized;
    }
  }
  return best ?? createDefaultSpaceState(null);
}

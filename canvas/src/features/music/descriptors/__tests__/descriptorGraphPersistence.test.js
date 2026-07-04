import { describe, expect, it } from 'vitest';
import { createDefaultDescriptorGraph, updateDescriptorValue } from '../../../../../packages/music-core/src/index.js';
import {
  descriptorGraphTimestamp,
  pickNewestDescriptorGraph,
  pickNewestSpaceState,
  spaceStateTimestamp,
} from '../descriptorGraphPersistence.js';

describe('descriptorGraphPersistence', () => {
  it('prefers the graph with the newest updatedAt timestamp', () => {
    const older = {
      ...updateDescriptorValue(createDefaultDescriptorGraph(), 'Energy', 0.2).graph,
      updatedAt: '2026-07-04T04:00:00.000Z',
    };
    const newer = {
      ...updateDescriptorValue(createDefaultDescriptorGraph(), 'Energy', 0.8).graph,
      updatedAt: '2026-07-04T05:00:00.000Z',
    };

    const picked = pickNewestDescriptorGraph(older, newer);

    expect(picked.descriptors.Energy.value).toBe(0.8);
    expect(descriptorGraphTimestamp(picked)).toBe(descriptorGraphTimestamp(newer));
  });

  it('falls back to defaults when no candidates are provided', () => {
    const picked = pickNewestDescriptorGraph();
    expect(picked.descriptors.Energy.value).toBe(0.5);
  });

  it('prefers the newest space state by updatedAt', () => {
    const older = { roomIdentity: 'void', updatedAt: '2026-07-04T04:00:00.000Z' };
    const newer = { roomIdentity: 'hall', updatedAt: '2026-07-04T05:00:00.000Z' };

    const picked = pickNewestSpaceState(older, newer);

    expect(picked.roomIdentity).toBe('hall');
    expect(spaceStateTimestamp(picked)).toBe(spaceStateTimestamp(newer));
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeMeasurements } from '../utils/measureSnap.js';

describe('threeD measurement persistence shape', () => {
  it('stores measurements on version.threeD alongside viewer state', () => {
    const measurement = {
      id: 'measure-1',
      snapMode: 'vertex',
      start: { position: [0, 0, 0], meshUuid: 'mesh-a' },
      end: { position: [3, 4, 0], meshUuid: 'mesh-a' },
      distance: 5,
      createdAt: '2026-07-03T12:00:00.000Z',
    };

    const threeD = {
      viewerState: { showGrid: false },
      annotations: [],
      measurements: normalizeMeasurements([measurement]),
    };

    expect(threeD.measurements).toHaveLength(1);
    expect(threeD.measurements[0].distance).toBe(5);
    expect(threeD.measurements[0].start.position).toEqual([0, 0, 0]);
  });
});

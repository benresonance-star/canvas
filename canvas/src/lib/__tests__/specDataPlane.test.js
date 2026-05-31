import { describe, it, expect } from 'vitest';
import {
  projectPayloadToSpecLayout,
  projectPayloadToSpecViewport,
  specLayoutDrift,
} from '../specDataPlane.js';

describe('specDataPlane', () => {
  it('projectPayloadToSpecLayout maps canvas and staging', () => {
    const layout = projectPayloadToSpecLayout({
      cards: [
        {
          id: 'c1',
          key: 'img__a',
          type: 'image',
          x: 10,
          y: 20,
          versions: [{ artifactRef: { id: 'art-1' } }],
        },
      ],
      stagedSyncCards: [
        { stagingId: 's1', key: 'notes__b', type: 'markdown', versions: [] },
      ],
    });
    expect(layout.placed).toHaveLength(1);
    expect(layout.placed[0].id).toBe('art-1');
    expect(layout.staging).toHaveLength(1);
  });

  it('projectPayloadToSpecViewport reads canvasView', () => {
    expect(
      projectPayloadToSpecViewport({ canvasView: { x: 1, y: 2, zoom: 0.5 } }),
    ).toEqual({ x: 1, y: 2, zoom: 0.5 });
  });

  it('specLayoutDrift detects key mismatch', () => {
    const payload = {
      cards: [{ id: 'c1', key: 'a', type: 'file', versions: [] }],
      stagedSyncCards: [],
    };
    const remote = { placed: [], staging: [] };
    expect(specLayoutDrift(payload, remote)).toBe(true);
  });
});

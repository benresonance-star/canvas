import { describe, it, expect } from 'vitest';
import {
  applySpecCanvasLayoutToPayload,
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

  it('applies spec surface moves from staging to canvas', () => {
    const payload = {
      cards: [],
      stagedSyncCards: [
        {
          stagingId: 's1',
          key: 'notes__a',
          prefix: 'notes',
          name: 'a',
          type: 'user_note',
          versions: [{ version: 1 }],
          pinnedVersion: 1,
        },
      ],
    };
    const merged = applySpecCanvasLayoutToPayload(payload, {
      layout: {
        placed: [
          {
            syncKey: 'notes__a',
            cardId: 'c-db',
            x: 120,
            y: 80,
            w: 240,
            h: 160,
          },
        ],
        staging: [],
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(merged.cards).toHaveLength(1);
    expect(merged.stagedSyncCards).toHaveLength(0);
    expect(merged.cards[0]).toMatchObject({
      id: 'c-db',
      key: 'notes__a',
      x: 120,
      y: 80,
      width: 240,
      height: 160,
    });
  });
});

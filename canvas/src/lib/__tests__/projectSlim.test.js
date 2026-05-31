import { describe, it, expect } from 'vitest';
import { slimProjectPayloadForCache } from '../projectSlim.js';
import { buildPlacementsFromArrays } from '../artifactPlacementsMap.js';

describe('slimProjectPayloadForCache', () => {
  it('produces smaller serialised payload with v2 placements than duplicated records', () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      key: `notes__note-${i}`,
      type: 'markdown',
      x: i * 10,
      y: i * 5,
      pinnedVersion: 1,
      versions: [
        {
          version: 1,
          content: 'x'.repeat(5000),
          cardType: 'markdown',
        },
      ],
    }));
    const v1Map = {};
    for (const c of cards) {
      v1Map[c.key] = { surface: 'canvas', record: c };
    }
    const fat = JSON.stringify({
      cards,
      stagedSyncCards: [],
      artifactPlacements: v1Map,
    });
    const slimPayload = {
      cards,
      stagedSyncCards: [],
      artifactPlacements: buildPlacementsFromArrays(cards, []),
    };
    const { serialised } = slimProjectPayloadForCache(slimPayload);
    expect(serialised.length).toBeLessThan(fat.length);
  });

  it('triggers trim when over trim target', () => {
    const cards = [
      {
        id: 'big',
        key: 'img__big',
        type: 'image',
        versions: [{ version: 1, dataUrl: 'data:image/png;base64,' + 'A'.repeat(4_000_000) }],
      },
    ];
    const { trimmed, serialised } = slimProjectPayloadForCache({
      cards,
      stagedSyncCards: [],
    });
    expect(trimmed).toBe(true);
    expect(serialised.length).toBeLessThan(4 * 1024 * 1024);
  });
});

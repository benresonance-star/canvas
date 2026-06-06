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

  it('strips placement records and staged dataUrls from persisted payloads', () => {
    const largeDataUrl = `data:application/pdf;base64,${'A'.repeat(1000)}`;
    const staged = {
      stagingId: 's1',
      key: 'pdf__large',
      type: 'pdf',
      versions: [{
        version: 1,
        dataUrl: largeDataUrl,
        previewCacheKey: 'p:pdf__large:v1',
      }],
    };
    const { payload, serialised } = slimProjectPayloadForCache({
      cards: [],
      stagedSyncCards: [staged],
      artifactPlacements: {
        pdf__large: {
          surface: 'dock',
          placement: { key: 'pdf__large', stagingId: 's1' },
          record: staged,
        },
      },
    });

    expect(payload.stagedSyncCards[0].versions[0].dataUrl).toBeNull();
    expect(payload.stagedSyncCards[0].versions[0].previewCacheKey).toBe('p:pdf__large:v1');
    expect(payload.artifactPlacements.pdf__large.record).toBeUndefined();
    expect(serialised).not.toContain(largeDataUrl);
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

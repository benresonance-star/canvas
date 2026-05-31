import { describe, it, expect } from 'vitest';
import {
  buildProjectSavePayload,
  sanitizeStagedForPersist,
  normalizeLoadedProject,
} from '../persistence.js';
import { createEmptyProjectState } from '../projects.js';

describe('buildProjectSavePayload', () => {
  it('strips objectUrl from staged card versions', () => {
    const payload = buildProjectSavePayload(
      {
        projectName: 'Test',
        cards: [],
        canvasView: { x: 0, y: 0, zoom: 1 },
      },
      [
        {
          stagingId: 'stg-1',
          key: 'img-a',
          name: 'Photo',
          type: 'image',
          versions: [
            {
              version: 1,
              ext: 'jpg',
              objectUrl: 'blob:http://localhost/x',
              previewCacheKey: 'p:1',
            },
          ],
          pinnedVersion: 1,
        },
      ],
    );

    expect(payload.stagedSyncCards).toHaveLength(1);
    expect(payload.stagedSyncCards[0].versions[0].objectUrl).toBeUndefined();
    expect(payload.stagedSyncCards[0].versions[0].previewCacheKey).toBe('p:1');
  });
});

describe('sanitizeStagedForPersist', () => {
  it('returns empty array for nullish input', () => {
    expect(sanitizeStagedForPersist(null)).toEqual([]);
  });
});

describe('normalizeLoadedProject', () => {
  it('coerces null cards and stagedSyncCards to empty arrays', () => {
    const normalized = normalizeLoadedProject({
      projectName: 'Test',
      cards: null,
      stagedSyncCards: null,
    });
    expect(normalized.cards).toEqual([]);
    expect(normalized.stagedSyncCards).toEqual([]);
  });

  it('coerces null versions on cards to empty arrays', () => {
    const normalized = normalizeLoadedProject({
      projectName: 'Test',
      cards: [{ id: '1', key: 'k', type: 'audio', versions: null }],
      stagedSyncCards: [],
    });
    expect(normalized.cards[0].versions).toEqual([]);
  });

  it('normalizes stagedSyncCards versions like canvas cards', () => {
    const normalized = normalizeLoadedProject({
      projectName: 'Test',
      cards: [],
      stagedSyncCards: [
        {
          stagingId: 'stg-1',
          key: 'k',
          versions: [
            {
              version: 1,
              inline: true,
              previewStripped: true,
              previewCacheKey: 'p:1',
            },
          ],
        },
      ],
    });

    expect(normalized.stagedSyncCards[0].versions[0].previewStripped).toBe(false);
  });

  it('migrates notes__ markdown cards to user_note on load', () => {
    const normalized = normalizeLoadedProject({
      projectName: 'Test',
      cards: [
        {
          id: '1',
          key: 'notes__idea',
          prefix: 'notes',
          type: 'markdown',
          versions: [],
        },
      ],
      stagedSyncCards: [],
    });
    expect(normalized.cards[0].type).toBe('user_note');
  });
});

describe('createEmptyProjectState', () => {
  it('includes empty stagedSyncCards', () => {
    expect(createEmptyProjectState().stagedSyncCards).toEqual([]);
  });
});

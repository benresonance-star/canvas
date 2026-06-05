import { describe, it, expect } from 'vitest';
import {
  artifactCountAuditStatus,
  summarizeArtifactDatabaseCounts,
} from '../artifactCountAudit.js';

describe('artifactCountAudit', () => {
  it('summarizes database canvas, dock, and placement counts', () => {
    const counts = summarizeArtifactDatabaseCounts({
      cards: [{ id: 'c1' }, { id: 'c2' }],
      stagedSyncCards: [{ stagingId: 's1' }],
      artifactPlacements: {
        a: { surface: 'canvas' },
        b: { surface: 'canvas' },
        c: { surface: 'dock' },
      },
    });

    expect(counts).toEqual({
      dbCanvas: 2,
      dbDock: 1,
      dbTotal: 3,
      placementCanvas: 2,
      placementDock: 1,
      placementTotal: 3,
    });
    expect(artifactCountAuditStatus(2, counts)).toBe('match');
  });

  it('flags mismatch when UI canvas and DB canvas placement counts diverge', () => {
    const counts = summarizeArtifactDatabaseCounts({
      cards: [{ id: 'c1' }, { id: 'c2' }],
      stagedSyncCards: [],
      artifactPlacements: {
        a: { surface: 'canvas' },
        b: { surface: 'dock' },
      },
    });

    expect(artifactCountAuditStatus(2, counts)).toBe('mismatch');
  });

  it('treats a missing database document as unknown instead of zero', () => {
    const counts = summarizeArtifactDatabaseCounts(null);

    expect(counts).toBeNull();
    expect(artifactCountAuditStatus(2, counts)).toBe('unknown');
  });
});

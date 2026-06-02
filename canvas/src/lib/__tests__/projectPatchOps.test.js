import { describe, it, expect } from 'vitest';
import {
  applyProjectOps,
  buildPatchOpsFromCommit,
  validateProjectPatchOps,
  shouldUsePatchForOps,
  MAX_PATCH_OPS,
} from '../sync/projectPatchOps.js';

const baseDoc = () => ({
  projectName: 'Test',
  canvasView: { x: 0, y: 0, zoom: 1 },
  cards: [
    {
      id: 'c1',
      key: 'notes__a',
      type: 'user_note',
      x: 10,
      y: 20,
      width: 200,
      height: 120,
      versions: [{ version: 1, content: 'hi' }],
    },
  ],
  stagedSyncCards: [
    {
      stagingId: 's1',
      key: 'pdf__b',
      type: 'pdf',
      versions: [{ version: 1, filename: 'b.pdf' }],
    },
  ],
  artifactPlacements: {
    notes__a: { surface: 'canvas', ref: { id: 'c1', key: 'notes__a' } },
    pdf__b: { surface: 'dock', ref: { stagingId: 's1', key: 'pdf__b' } },
  },
});

describe('projectPatchOps', () => {
  it('applyProjectOps moves card layout', () => {
    const doc = baseDoc();
    const next = applyProjectOps(doc, [
      { op: 'setCardLayout', id: 'c1', x: 100, y: 200 },
    ]);
    expect(next.cards[0].x).toBe(100);
    expect(next.cards[0].y).toBe(200);
    expect(next.artifactPlacements.notes__a).toBeDefined();
  });

  it('applyProjectOps dock→canvas via setPlacement', () => {
    const doc = baseDoc();
    const staged = doc.stagedSyncCards[0];
    const card = {
      id: 'c2',
      key: 'pdf__b',
      type: 'pdf',
      x: 50,
      y: 50,
      width: 180,
      height: 100,
      versions: staged.versions,
    };
    const next = applyProjectOps(doc, [
      {
        op: 'setPlacement',
        key: 'pdf__b',
        surface: 'canvas',
        ref: card,
      },
      { op: 'removeStaged', stagingId: 's1' },
    ]);
    expect(next.cards.some((c) => c.key === 'pdf__b')).toBe(true);
    expect(next.stagedSyncCards.some((s) => s.stagingId === 's1')).toBe(false);
    const placementKey = Object.keys(next.artifactPlacements).find(
      (k) => next.artifactPlacements[k]?.surface === 'canvas',
    );
    expect(placementKey).toBeTruthy();
  });

  it('buildPatchOpsFromCommit emits layout ops for drag', () => {
    const before = baseDoc();
    const after = {
      ...before,
      cards: [{ ...before.cards[0], x: 300, y: 400 }],
    };
    const ops = buildPatchOpsFromCommit(before, after, 'layoutCommit');
    expect(ops.some((o) => o.op === 'setCardLayout')).toBe(true);
    expect(shouldUsePatchForOps(ops)).toBe(true);
    const applied = applyProjectOps(before, ops);
    expect(applied.cards[0].x).toBe(300);
  });

  it('buildPatchOpsFromCommit emits setCanvasView for view-only change', () => {
    const before = baseDoc();
    const after = {
      ...before,
      canvasView: { x: 10, y: 20, zoom: 1.5 },
    };
    const ops = buildPatchOpsFromCommit(before, after, 'viewCommit');
    expect(ops.some((o) => o.op === 'setCanvasView')).toBe(true);
    const applied = applyProjectOps(before, ops);
    expect(applied.canvasView.zoom).toBe(1.5);
    expect(applied.cards.length).toBe(before.cards.length);
  });

  it('validateProjectPatchOps rejects too many ops', () => {
    const ops = Array.from({ length: MAX_PATCH_OPS + 1 }, (_, i) => ({
      op: 'setCardLayout',
      id: `c${i}`,
      x: i,
    }));
    expect(validateProjectPatchOps(ops).ok).toBe(false);
  });

  it('replaceDocument op replaces entire payload', () => {
    const doc = baseDoc();
    const replacement = { projectName: 'New', cards: [], stagedSyncCards: [] };
    const next = applyProjectOps(doc, [
      { op: 'replaceDocument', payload: replacement },
    ]);
    expect(next.projectName).toBe('New');
    expect(next.cards).toEqual([]);
  });

  it('PATCH then refresh invariant: arrays match placement map', () => {
    const before = baseDoc();
    const after = applyProjectOps(before, [
      {
        op: 'setPlacement',
        key: 'pdf__b',
        surface: 'canvas',
        ref: {
          id: 'c2',
          key: 'pdf__b',
          type: 'pdf',
          x: 0,
          y: 0,
          versions: before.stagedSyncCards[0].versions,
        },
      },
      { op: 'removeStaged', stagingId: 's1' },
    ]);
    expect(
      Object.values(after.artifactPlacements).some((e) => e?.surface === 'canvas'),
    ).toBe(true);
    expect(after.cards.some((c) => c.key === 'pdf__b')).toBe(true);
    expect(after.stagedSyncCards.every((s) => s.stagingId !== 's1')).toBe(true);
  });
});

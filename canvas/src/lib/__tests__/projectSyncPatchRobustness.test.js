import { describe, it, expect } from 'vitest';
import {
  applyProjectOps,
  buildPatchOpsFromCommit,
  validateProjectPatchOps,
  MAX_PATCH_OPS,
} from '../sync/projectPatchOps.js';
import {
  applyRemoteProjectPatch,
  flushPendingRemoteProjectPatch,
  resetProjectSyncRemoteApplyForTests,
} from '../sync/projectSyncRemoteApply.js';
import { resetCanvasInteractionForTests, beginCanvasInteraction, endCanvasInteraction } from '../canvasInteraction.js';

const base = () => ({
  projectName: 'P',
  canvasView: { x: 0, y: 0, zoom: 1 },
  cards: [{ id: 'c1', key: 'k', x: 0, y: 0 }],
  stagedSyncCards: [],
  artifactPlacements: { k: { surface: 'canvas', ref: { id: 'c1' } } },
});

describe('projectSyncPatch robustness', () => {
  it('R3: patch apply matches committed state', () => {
    const before = base();
    const after = { ...before, cards: [{ ...before.cards[0], x: 99, y: 88 }] };
    const ops = buildPatchOpsFromCommit(before, after, 'layoutCommit');
    const applied = applyProjectOps(before, ops);
    expect(applied.cards[0].x).toBe(99);
    expect(applied.artifactPlacements.k.surface).toBe('canvas');
  });

  it('R6: view-only patch leaves cards unchanged', () => {
    const before = base();
    const ops = [{ op: 'setCanvasView', view: { x: 5, y: 6, zoom: 2 } }];
    const applied = applyProjectOps(before, ops);
    expect(applied.canvasView.zoom).toBe(2);
    expect(applied.cards[0].x).toBe(0);
  });

  it('R10: ops over limit rejected', () => {
    const ops = Array.from({ length: MAX_PATCH_OPS + 1 }, (_, i) => ({
      op: 'setCardLayout',
      id: `c${i}`,
      x: i,
    }));
    expect(validateProjectPatchOps(ops).ok).toBe(false);
  });

  it('R4: queues remote patch during interaction', async () => {
    resetProjectSyncRemoteApplyForTests();
    resetCanvasInteractionForTests();
    beginCanvasInteraction('card');
    const result = await applyRemoteProjectPatch(
      'p1',
      [{ op: 'setCardLayout', id: 'c1', x: 1, y: 2 }],
      3,
      { clientId: 'remote', localClientId: 'local' },
    );
    expect(result.queued).toBe(true);
    endCanvasInteraction('card');
  });

  it('does not flush a queued remote patch into a different project', async () => {
    resetProjectSyncRemoteApplyForTests();
    resetCanvasInteractionForTests();
    beginCanvasInteraction('card');
    await applyRemoteProjectPatch(
      'p1',
      [{ op: 'setCardLayout', id: 'c1', x: 1, y: 2 }],
      3,
      { clientId: 'remote', localClientId: 'local' },
    );
    endCanvasInteraction('card');

    await expect(flushPendingRemoteProjectPatch('p2', 'local')).resolves.toBeNull();
  });
});

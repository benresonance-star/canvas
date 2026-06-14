import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../sync/projectSyncLocal.js', () => ({
  readLocalProjectSerialised: vi.fn(async () => null),
}));

vi.mock('../projectSync.js', () => ({
  cancelPendingProjectSave: vi.fn(),
  persistProjectDocumentLocally: vi.fn(async () => true),
  flushOutgoingProjectDocument: vi.fn(async () => ({ ok: true })),
  initializeProjectSync: vi.fn(),
  isServerSyncEnabled: () => false,
}));
import { canMutateCanvas } from '../syncProjectionInvariants.js';
import {
  isPlacementCommitBlocked,
  placementCommitBlockedResult,
  shouldGatePlacementCommit,
  shouldDeferPlacementSyncForPendingCommit,
} from '../placementCommitGate.js';
import { transferStagedToCanvas } from '../placementTransfer.js';
import {
  commitProjectDocument,
  resetProjectDocumentCommitForTests,
} from '../projectDocumentCommit.js';

describe('shouldGatePlacementCommit', () => {
  it('gates placementTransfer reasons only', () => {
    expect(shouldGatePlacementCommit('placementTransfer:canvas')).toBe(true);
    expect(shouldGatePlacementCommit('placementTransfer:dock')).toBe(true);
    expect(shouldGatePlacementCommit('folderScan')).toBe(false);
    expect(shouldGatePlacementCommit('folderScan:agentStage')).toBe(false);
    expect(shouldGatePlacementCommit('structuralChange')).toBe(false);
  });
});

describe('placementCommitGate (H1b mechanism)', () => {
  it('projectSwitch:outgoing bypasses placement transfer gate', () => {
    expect(shouldGatePlacementCommit('projectSwitch:outgoing')).toBe(false);
  });

  it('blocks when canMutateCanvasRef is false', () => {
    expect(isPlacementCommitBlocked({ current: false })).toBe(true);
    expect(placementCommitBlockedResult({ current: false })).toEqual({
      ok: false,
      skipped: 'projection_not_ready',
      deferred: true,
    });
  });

  it('allows when canMutateCanvasRef is true or unset', () => {
    expect(isPlacementCommitBlocked({ current: true })).toBe(false);
    expect(placementCommitBlockedResult({ current: true })).toBe(null);
    expect(isPlacementCommitBlocked(null)).toBe(false);
  });

  it('defers placement sync while the matching placement commit is pending', () => {
    expect(
      shouldDeferPlacementSyncForPendingCommit('p1', {
        projectId: 'p1',
        reason: 'placementTransfer:canvas',
      }),
    ).toBe(true);
    expect(
      shouldDeferPlacementSyncForPendingCommit('p1', {
        projectId: 'p2',
        reason: 'placementTransfer:canvas',
      }),
    ).toBe(false);
    expect(shouldDeferPlacementSyncForPendingCommit('p1', null)).toBe(false);
  });
});

describe('canMutateCanvas matrix (I6)', () => {
  it('false when selecting even if ids match', () => {
    expect(
      canMutateCanvas({
        phase: 'selecting',
        effectiveProjectId: 'p',
        committedProjectId: 'p',
        hydrated: true,
      }),
    ).toBe(false);
  });

  it('false when ready but not hydrated', () => {
    expect(
      canMutateCanvas({
        phase: 'ready',
        effectiveProjectId: 'p',
        committedProjectId: 'p',
        hydrated: false,
      }),
    ).toBe(false);
  });

  it('false when effective and committed diverge', () => {
    expect(
      canMutateCanvas({
        phase: 'ready',
        effectiveProjectId: 'pending',
        committedProjectId: 'p',
        hydrated: true,
      }),
    ).toBe(false);
  });

  it('true when ready, aligned, and hydrated', () => {
    expect(
      canMutateCanvas({
        phase: 'ready',
        effectiveProjectId: 'p',
        committedProjectId: 'p',
        hydrated: true,
      }),
    ).toBe(true);
  });
});

describe('placement pipeline control (guards off)', () => {
  beforeEach(() => {
    resetProjectDocumentCommitForTests();
    vi.clearAllMocks();
  });

  it('transfer + commit persists canvas surface', async () => {
    const staged = [
      {
        stagingId: 's1',
        key: 'notes__a',
        prefix: 'notes',
        name: 'A',
        type: 'markdown',
        versions: [{ version: 1, filename: 'notes__a-v1.md' }],
        pinnedVersion: 1,
      },
    ];
    const transfer = transferStagedToCanvas([], staged, 's1', 120, 80);
    expect(transfer.placed).toBe(true);

    const result = await commitProjectDocument('p-hyp', {
      state: {
        projectName: 'P',
        cards: transfer.cards,
        canvasView: { x: 0, y: 0, zoom: 1 },
      },
      stagedSyncCards: transfer.stagedSyncCards,
      artifactPlacements: transfer.artifactPlacements,
      reason: 'placementTransfer:canvas',
    });

    expect(result.ok).not.toBe(false);
    expect(result.payload?.artifactPlacements?.notes__a?.surface).toBe('canvas');
    expect(result.payload?.cards).toHaveLength(1);
  });
});

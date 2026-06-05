import { describe, it, expect } from 'vitest';
import {
  getEffectiveProjectId,
  isEffectiveProjectIdConsistent,
  isSelectionProjectionSettled,
  isLoadedProjectAlignedWithSelection,
  resolveHeaderProjectName,
  resolveActiveProjectIdRefSync,
  isHeaderAlignedWithMenuSelection,
  indexRowMatchesActiveProject,
  switchStillCurrent,
  shouldRestoreWorkspaceOnSwitchFailure,
  shouldAcceptIncomingRevision,
  isStaleIncomingRevision,
  buildProjectionSnapshot,
  deriveProjectPhase,
  canMutateCanvas,
  shouldShowSelectProjectPrompt,
  assertProjectionConsistent,
} from '../syncProjectionInvariants.js';

describe('getEffectiveProjectId', () => {
  it('prefers pending over active', () => {
    expect(getEffectiveProjectId('frog', 'tree')).toBe('frog');
  });

  it('falls back to active when no pending', () => {
    expect(getEffectiveProjectId(null, 'tree')).toBe('tree');
  });
});

describe('isEffectiveProjectIdConsistent (I1)', () => {
  it('is consistent when pending drives effective id', () => {
    expect(isEffectiveProjectIdConsistent('frog', 'tree')).toBe(true);
  });

  it('is consistent when settled on active', () => {
    expect(isEffectiveProjectIdConsistent(null, 'tree')).toBe(true);
  });
});

describe('isSelectionProjectionSettled (I1)', () => {
  it('is not settled while pending switch', () => {
    expect(
      isSelectionProjectionSettled({
        pendingSwitchProjectId: 'frog',
        activeProjectId: 'tree',
        indexActiveProjectId: 'tree',
      }),
    ).toBe(false);
  });

  it('is settled when pending null and active matches index', () => {
    expect(
      isSelectionProjectionSettled({
        pendingSwitchProjectId: null,
        activeProjectId: 'frog',
        indexActiveProjectId: 'frog',
      }),
    ).toBe(true);
  });

  it('is settled when index unknown but pending null', () => {
    expect(
      isSelectionProjectionSettled({
        pendingSwitchProjectId: null,
        activeProjectId: 'frog',
        indexActiveProjectId: null,
      }),
    ).toBe(true);
  });
});

describe('isLoadedProjectAlignedWithSelection (I1)', () => {
  it('aligns loaded id with effective id during pending switch', () => {
    expect(isLoadedProjectAlignedWithSelection('frog', 'frog', 'tree')).toBe(true);
  });

  it('fails when loaded id mismatches effective', () => {
    expect(isLoadedProjectAlignedWithSelection('tree', 'frog', 'tree')).toBe(false);
  });
});

describe('resolveHeaderProjectName (I1)', () => {
  const defaultName = 'Untitled Project';

  it('prefers projectList row over stale state projectName', () => {
    expect(
      resolveHeaderProjectName({
        projectList: [{ id: 'test', name: 'TEST' }],
        effectiveProjectId: 'test',
        stateProjectName: 'TREE STORM',
        projectNameDirty: false,
        defaultName,
      }),
    ).toBe('TEST');
  });

  it('keeps custom state title when index row is still default Untitled', () => {
    expect(
      resolveHeaderProjectName({
        projectList: [{ id: 'frog', name: 'Untitled Project' }],
        effectiveProjectId: 'frog',
        committedProjectId: 'frog',
        stateProjectName: 'FROG',
        projectNameDirty: false,
        defaultName,
      }),
    ).toBe('FROG');
  });

  it('uses state when user is editing (dirty)', () => {
    expect(
      resolveHeaderProjectName({
        projectList: [{ id: 'test', name: 'TEST' }],
        effectiveProjectId: 'test',
        stateProjectName: 'Custom',
        projectNameDirty: true,
        defaultName,
      }),
    ).toBe('Custom');
  });

  it('does not show stale state name when no selection context', () => {
    expect(
      resolveHeaderProjectName({
        projectList: [{ id: 'frog', name: 'FROG' }],
        effectiveProjectId: null,
        committedProjectId: null,
        stateProjectName: 'FROG',
        projectNameDirty: false,
        defaultName,
      }),
    ).toBe(defaultName);
  });

  it('uses committed id for list row when effective is null', () => {
    expect(
      resolveHeaderProjectName({
        projectList: [{ id: 'frog', name: 'FROG' }],
        effectiveProjectId: null,
        committedProjectId: 'frog',
        stateProjectName: 'Untitled Project',
        projectNameDirty: false,
        defaultName,
      }),
    ).toBe('FROG');
  });
});

describe('resolveActiveProjectIdRefSync', () => {
  it('preserves in-flight ref when effective and committed are null', () => {
    expect(
      resolveActiveProjectIdRefSync({
        effectiveProjectId: null,
        committedProjectId: null,
        pendingProjectId: 'frog',
        projectSwitchLoading: false,
        switchingProject: true,
        currentRef: 'frog',
      }),
    ).toBe('frog');
  });

  it('uses effective id during pending switch', () => {
    expect(
      resolveActiveProjectIdRefSync({
        effectiveProjectId: 'frog',
        committedProjectId: 'tree',
        pendingProjectId: 'frog',
        projectSwitchLoading: true,
        switchingProject: false,
        currentRef: 'tree',
      }),
    ).toBe('frog');
  });

  it('snaps to committed when settled', () => {
    expect(
      resolveActiveProjectIdRefSync({
        effectiveProjectId: 'frog',
        committedProjectId: 'frog',
        pendingProjectId: null,
        projectSwitchLoading: false,
        switchingProject: false,
        currentRef: 'tree',
      }),
    ).toBe('frog');
  });
});

describe('isHeaderAlignedWithMenuSelection', () => {
  it('detects menu/header drift', () => {
    expect(
      isHeaderAlignedWithMenuSelection(
        'TREE STORM',
        [{ id: 'test', name: 'TEST' }],
        'test',
      ),
    ).toBe(false);
  });

  it('passes when names match', () => {
    expect(
      isHeaderAlignedWithMenuSelection(
        'TEST',
        [{ id: 'test', name: 'TEST' }],
        'test',
      ),
    ).toBe(true);
  });
});

describe('indexRowMatchesActiveProject (I4)', () => {
  it('passes when list contains active id', () => {
    expect(
      indexRowMatchesActiveProject(
        [{ id: 'tree' }, { id: 'frog' }],
        'frog',
      ),
    ).toBe(true);
  });

  it('fails when active id missing from list', () => {
    expect(indexRowMatchesActiveProject([{ id: 'tree' }], 'frog')).toBe(false);
  });
});

describe('switchStillCurrent / shouldRestoreWorkspaceOnSwitchFailure (I5)', () => {
  it('is current when sequences match', () => {
    expect(switchStillCurrent(3, 3)).toBe(true);
    expect(shouldRestoreWorkspaceOnSwitchFailure(3, 3)).toBe(true);
  });

  it('is not current when a newer switch started', () => {
    expect(switchStillCurrent(2, 3)).toBe(false);
    expect(shouldRestoreWorkspaceOnSwitchFailure(2, 3)).toBe(false);
  });
});

describe('shouldAcceptIncomingRevision (I3)', () => {
  it('accepts when incoming revision is newer', () => {
    expect(shouldAcceptIncomingRevision(5, 6)).toBe(true);
  });

  it('accepts equal revision', () => {
    expect(shouldAcceptIncomingRevision(5, 5)).toBe(true);
  });

  it('rejects strictly older revision', () => {
    expect(shouldAcceptIncomingRevision(6, 5)).toBe(false);
    expect(isStaleIncomingRevision(6, 5)).toBe(true);
  });

  it('accepts when client revision unknown', () => {
    expect(shouldAcceptIncomingRevision(null, 1)).toBe(true);
  });
});

describe('deriveProjectPhase', () => {
  it('selecting when pending switch', () => {
    expect(
      deriveProjectPhase({
        loaded: true,
        projectListLength: 2,
        pendingSwitchProjectId: 'b',
        committedProjectId: 'a',
      }),
    ).toBe('selecting');
  });

  it('ready when committed and settled', () => {
    expect(
      deriveProjectPhase({
        loaded: true,
        projectListLength: 2,
        pendingSwitchProjectId: null,
        committedProjectId: 'a',
      }),
    ).toBe('ready');
  });

  it('noProjects when list empty', () => {
    expect(
      deriveProjectPhase({
        loaded: true,
        projectListLength: 0,
        committedProjectId: null,
      }),
    ).toBe('noProjects');
  });
});

describe('canMutateCanvas (I6)', () => {
  it('false during selecting', () => {
    expect(
      canMutateCanvas({
        phase: 'selecting',
        effectiveProjectId: 'b',
        committedProjectId: 'a',
        hydrated: true,
      }),
    ).toBe(false);
  });

  it('true when ready and ids aligned', () => {
    expect(
      canMutateCanvas({
        phase: 'ready',
        effectiveProjectId: 'a',
        committedProjectId: 'a',
        hydrated: true,
      }),
    ).toBe(true);
  });
});

describe('shouldShowSelectProjectPrompt', () => {
  it('shows when projects exist but none committed', () => {
    expect(
      shouldShowSelectProjectPrompt({
        projectListLength: 3,
        committedProjectId: null,
        phase: 'idle',
      }),
    ).toBe(true);
  });
});

describe('assertProjectionConsistent', () => {
  it('flags mutate while not ready', () => {
    const result = assertProjectionConsistent({
      pendingProjectId: 'b',
      committedProjectId: 'a',
      effectiveProjectId: 'b',
      phase: 'selecting',
      hydrated: true,
      canMutateCanvas: true,
    });
    expect(result.ok).toBe(false);
    expect(result.violations).toContain('mutate_while_not_ready');
  });
});

describe('buildProjectionSnapshot', () => {
  it('reports drift when pending switch and load still on previous project', () => {
    const snap = buildProjectionSnapshot({
      pendingSwitchProjectId: 'frog',
      activeProjectId: 'tree',
      indexActiveProjectId: 'tree',
      loadedProjectId: 'tree',
      projectName: 'TREE STORM',
      cardCount: 2,
    });
    expect(snap.effectiveProjectId).toBe('frog');
    expect(snap.selectionSettled).toBe(false);
    expect(snap.loadAligned).toBe(false);
  });

  it('reports aligned settled projection', () => {
    const snap = buildProjectionSnapshot({
      pendingSwitchProjectId: null,
      activeProjectId: 'frog',
      indexActiveProjectId: 'frog',
      loadedProjectId: 'frog',
      clientRevision: 10,
      projectName: 'FROG',
      cardCount: 1,
    });
    expect(snap.selectionSettled).toBe(true);
    expect(snap.loadAligned).toBe(true);
    expect(snap.effectiveConsistent).toBe(true);
  });
});

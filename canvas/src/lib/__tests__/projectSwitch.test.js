import { describe, it, expect } from 'vitest';
import {
  shouldApplyProjectLoad,
  shouldRetrySwitchLoad,
  shouldSkipProjectSwitch,
  buildSwitchPlaceholderState,
  buildProjectSwitchCommitPlan,
  withSwitchPaintTimeout,
  SWITCH_PAINT_TIMEOUT_MS,
} from '../projectSwitch.js';
import {
  shouldRestoreWorkspaceOnSwitchFailure,
  isLoadedProjectAlignedWithSelection,
  isSelectionProjectionSettled,
  resolveHeaderProjectName,
  isHeaderAlignedWithMenuSelection,
} from '../syncProjectionInvariants.js';

describe('shouldSkipProjectSwitch', () => {
  it('skips when target missing', () => {
    const activeProjectIdRef = { current: 'a' };
    const projectHydratedRef = { current: new Set(['a']) };
    expect(shouldSkipProjectSwitch(null, activeProjectIdRef, projectHydratedRef)).toBe(true);
  });

  it('skips when same id and already hydrated', () => {
    const activeProjectIdRef = { current: 'frog' };
    const projectHydratedRef = { current: new Set(['frog']) };
    expect(shouldSkipProjectSwitch('frog', activeProjectIdRef, projectHydratedRef)).toBe(true);
  });

  it('does not skip when same id but not hydrated', () => {
    const activeProjectIdRef = { current: 'frog' };
    const projectHydratedRef = { current: new Set() };
    expect(shouldSkipProjectSwitch('frog', activeProjectIdRef, projectHydratedRef)).toBe(false);
  });

  it('does not skip when switching to a different project', () => {
    const activeProjectIdRef = { current: 'frog' };
    const projectHydratedRef = { current: new Set(['frog']) };
    expect(shouldSkipProjectSwitch('tree', activeProjectIdRef, projectHydratedRef)).toBe(false);
  });
});

describe('shouldApplyProjectLoad', () => {
  it('rejects when requested project id is missing', () => {
    expect(shouldApplyProjectLoad(null, 'a', 1, 1)).toBe(false);
  });

  it('rejects when requested id does not match current active ref', () => {
    expect(shouldApplyProjectLoad('b', 'a', 1, 1)).toBe(false);
  });

  it('accepts when ids match and switch sequence is unchanged', () => {
    expect(shouldApplyProjectLoad('a', 'a', 2, 2)).toBe(true);
  });

  it('rejects when switch sequence advanced during async load', () => {
    expect(shouldApplyProjectLoad('a', 'a', 1, 2)).toBe(false);
  });

  it('accepts when no switch sequence is tracked (boot path)', () => {
    expect(shouldApplyProjectLoad('a', 'a', null, null)).toBe(true);
  });

  it('accepts boot load when ref matches target (in-flight commit)', () => {
    expect(shouldApplyProjectLoad('frog', 'frog', null, null)).toBe(true);
  });

  it('rejects boot load when ref was cleared to null', () => {
    expect(shouldApplyProjectLoad('frog', null, null, null)).toBe(false);
  });
});

describe('shouldRetrySwitchLoad', () => {
  it('does not retry when first load succeeded', () => {
    expect(shouldRetrySwitchLoad([{ id: '1' }], 'frog', 'frog', 1, 1)).toBe(false);
  });

  it('retries when local load returns an empty canvas', () => {
    expect(shouldRetrySwitchLoad([], 'frog', 'frog', 2, 2)).toBe(true);
  });

  it('retries when load null, ref still target, seq unchanged', () => {
    expect(shouldRetrySwitchLoad(null, 'frog', 'frog', 2, 2)).toBe(true);
  });

  it('does not retry when active ref moved to another switch', () => {
    expect(shouldRetrySwitchLoad(null, 'frog', 'tree', 2, 2)).toBe(false);
  });

  it('does not retry when switch sequence advanced', () => {
    expect(shouldRetrySwitchLoad(null, 'frog', 'frog', 1, 2)).toBe(false);
  });
});

describe('withSwitchPaintTimeout', () => {
  it('rejects with SWITCH_TIMEOUT when paint exceeds budget', async () => {
    await expect(
      withSwitchPaintTimeout(
        () => new Promise(() => {}),
        20,
      ),
    ).rejects.toMatchObject({ code: 'SWITCH_TIMEOUT' });
  });

  it('resolves when paint completes first', async () => {
    await expect(
      withSwitchPaintTimeout(async () => 'ok', SWITCH_PAINT_TIMEOUT_MS),
    ).resolves.toBe('ok');
  });
});

describe('buildSwitchPlaceholderState', () => {
  const defaultName = 'Untitled Project';

  it('clears cards without resetting canvas view', () => {
    expect(buildSwitchPlaceholderState(null, defaultName)).toEqual({
      projectName: defaultName,
      cards: [],
    });
  });

  it('uses index row name when present', () => {
    expect(
      buildSwitchPlaceholderState({ name: '  My Project  ' }, defaultName),
    ).toEqual({
      projectName: 'My Project',
      cards: [],
    });
  });

  it('falls back to default when name is blank', () => {
    expect(buildSwitchPlaceholderState({ name: '   ' }, defaultName)).toEqual({
      projectName: defaultName,
      cards: [],
    });
  });
});

describe('buildProjectSwitchCommitPlan', () => {
  it('commits the previous active project on ordinary switches', () => {
    expect(
      buildProjectSwitchCommitPlan({
        targetId: 'tree',
        currentActiveProjectId: 'frog',
      }),
    ).toEqual({
      reloadActiveOnly: false,
      outgoingProjectId: 'frog',
    });
  });

  it('does not commit outgoing when a delete flow already removed it', () => {
    expect(
      buildProjectSwitchCommitPlan({
        targetId: 'tree',
        currentActiveProjectId: 'frog',
        commitOutgoing: false,
      }),
    ).toEqual({
      reloadActiveOnly: false,
      outgoingProjectId: null,
    });
  });

  it('does not commit outgoing when reloading the active project', () => {
    expect(
      buildProjectSwitchCommitPlan({
        targetId: 'frog',
        currentActiveProjectId: 'frog',
      }),
    ).toEqual({
      reloadActiveOnly: true,
      outgoingProjectId: null,
    });
  });
});

describe('switch rollback projection contract', () => {
  it('does not restore when switch was superseded (I5)', () => {
    const switchSeq = 1;
    const seqNow = 2;
    expect(shouldRestoreWorkspaceOnSwitchFailure(switchSeq, seqNow)).toBe(false);
    expect(shouldApplyProjectLoad('frog', 'frog', switchSeq, seqNow)).toBe(false);
  });

  it('allows restore when switch still current after failed load', () => {
    const switchSeq = 2;
    expect(shouldRestoreWorkspaceOnSwitchFailure(switchSeq, switchSeq)).toBe(true);
    expect(shouldRetrySwitchLoad(null, 'frog', 'frog', switchSeq, switchSeq)).toBe(true);
  });

  it('detects menu/canvas drift when active reverted but load still on target', () => {
    expect(
      isLoadedProjectAlignedWithSelection('frog', null, 'tree'),
    ).toBe(false);
    expect(
      isSelectionProjectionSettled({
        pendingSwitchProjectId: null,
        activeProjectId: 'tree',
        indexActiveProjectId: 'tree',
      }),
    ).toBe(true);
  });

  it('detects aligned state after successful switch commit', () => {
    expect(
      isLoadedProjectAlignedWithSelection('frog', null, 'frog'),
    ).toBe(true);
    expect(
      isSelectionProjectionSettled({
        pendingSwitchProjectId: null,
        activeProjectId: 'frog',
        indexActiveProjectId: 'frog',
      }),
    ).toBe(true);
  });

  it('header resolver fixes TEST menu vs TREE STORM state drift', () => {
    const list = [
      { id: 'tree', name: 'TREE STORM' },
      { id: 'test', name: 'TEST' },
    ];
    const header = resolveHeaderProjectName({
      projectList: list,
      effectiveProjectId: 'test',
      stateProjectName: 'TREE STORM',
      projectNameDirty: false,
    });
    expect(header).toBe('TEST');
    expect(isHeaderAlignedWithMenuSelection(header, list, 'test')).toBe(true);
  });
});

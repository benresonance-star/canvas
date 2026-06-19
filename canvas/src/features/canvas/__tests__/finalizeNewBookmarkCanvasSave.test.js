import { describe, expect, it, vi } from 'vitest';
import {
  buildNewBookmarkCanvasCard,
  finalizeNewBookmarkCanvasSave,
} from '../useCanvasDocument.js';

describe('buildNewBookmarkCanvasCard', () => {
  it('places new cards on a staggered grid', () => {
    expect(buildNewBookmarkCanvasCard({ id: 'c1', key: 'links__a' }, 0)).toMatchObject({
      x: 100,
      y: 100,
    });
    expect(buildNewBookmarkCanvasCard({ id: 'c2', key: 'links__b' }, 1)).toMatchObject({
      x: 420,
      y: 100,
    });
    expect(buildNewBookmarkCanvasCard({ id: 'c3', key: 'links__c' }, 4)).toMatchObject({
      x: 100,
      y: 340,
    });
  });
});

describe('finalizeNewBookmarkCanvasSave', () => {
  const baseCard = {
    id: 'bookmark-1',
    key: 'links__example-com-abc12345',
    type: 'bookmark',
    name: 'Example',
  };

  function buildDeps(overrides = {}) {
    const stateRef = {
      current: {
        projectName: 'Project',
        cards: [{ id: 'existing', key: 'links__old' }],
      },
    };
    const stagedSyncCardsRef = { current: [] };
    const setState = vi.fn();
    const registerOptimisticCard = vi.fn();
    const commitProjectDocument = vi.fn(async () => ({
      ok: true,
      localCacheWritten: true,
    }));
    const setFolderPresentKeys = vi.fn((updater) => updater(['links__old']));
    const refreshGraph = vi.fn(async () => {});

    return {
      projectId: 'project-1',
      result: { card: baseCard },
      stateRef,
      stagedSyncCardsRef,
      setState,
      registerOptimisticCard,
      commitProjectDocument,
      setFolderPresentKeys,
      folderHandle: {},
      refreshGraph,
      ...overrides,
    };
  }

  it('adds the bookmark to state and commits locally without blocking remote push', async () => {
    const deps = buildDeps();
    const newCard = await finalizeNewBookmarkCanvasSave(deps);

    expect(newCard).toMatchObject({
      id: 'bookmark-1',
      x: 420,
      y: 100,
    });
    expect(deps.stateRef.current.cards).toHaveLength(2);
    expect(deps.setState).toHaveBeenCalledWith(deps.stateRef.current);
    expect(deps.registerOptimisticCard).toHaveBeenCalledWith('project-1', 'bookmark-1');
    expect(deps.commitProjectDocument).toHaveBeenCalledWith('project-1', {
      state: deps.stateRef.current,
      stagedSyncCards: [],
      reason: 'bookmark:create',
      pushRemote: false,
    });
    expect(deps.setFolderPresentKeys).toHaveBeenCalled();
    expect(deps.refreshGraph).toHaveBeenCalled();
  });

  it('does not await refreshGraph before returning', async () => {
    let resolveRefresh;
    const refreshGraph = vi.fn(
      () => new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const deps = buildDeps({ refreshGraph });

    const pending = finalizeNewBookmarkCanvasSave(deps);
    await Promise.resolve();
    expect(refreshGraph).toHaveBeenCalled();
    resolveRefresh();
    await pending;
  });

  it('supports consecutive local saves without waiting on remote push', async () => {
    const commitProjectDocument = vi.fn(async () => ({
      ok: true,
      localCacheWritten: true,
    }));
    const deps = buildDeps({ commitProjectDocument });
    const secondCard = {
      id: 'bookmark-2',
      key: 'links__example-org-def67890',
      type: 'bookmark',
      name: 'Example 2',
    };

    await finalizeNewBookmarkCanvasSave(deps);
    deps.result = { card: secondCard };
    await finalizeNewBookmarkCanvasSave(deps);

    expect(deps.stateRef.current.cards).toHaveLength(3);
    expect(commitProjectDocument).toHaveBeenCalledTimes(2);
    expect(commitProjectDocument.mock.calls.every(([, opts]) => opts.pushRemote === false)).toBe(true);
  });

  it('throws when local commit fails and does not update folder present keys', async () => {
    const commitError = new Error('Local save failed');
    const deps = buildDeps({
      commitProjectDocument: vi.fn(async () => ({
        ok: false,
        error: commitError,
      })),
    });

    await expect(finalizeNewBookmarkCanvasSave(deps)).rejects.toThrow('Local save failed');
    expect(deps.setFolderPresentKeys).not.toHaveBeenCalled();
  });

  it('skips folder present keys when folder is not connected', async () => {
    const deps = buildDeps({ folderHandle: null });
    await finalizeNewBookmarkCanvasSave(deps);
    expect(deps.setFolderPresentKeys).not.toHaveBeenCalled();
  });

  it('updates folder present keys when folder is connected', async () => {
    const deps = buildDeps();
    await finalizeNewBookmarkCanvasSave(deps);
    const updater = deps.setFolderPresentKeys.mock.calls[0][0];
    expect(updater(['links__old'])).toEqual([
      'links__old',
      'links__example-com-abc12345',
    ]);
  });
});

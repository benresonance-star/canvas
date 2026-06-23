import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLOW_AUTOSAVE_DELAY_MS,
  FLOW_CHAINED_SAVE_DELAY_MS,
  FLOW_FLUSH_MAX_ATTEMPTS,
  FLOW_SAVE_RETRY_DELAY_MS,
  runBoundedFlush,
  scheduleAutosave,
  syncFlowRevisionRefs,
} from '../flowAutosave.js';

function createSaveHarness({
  saveFlow,
  onCardRefresh = null,
  initialRevision = 1,
}) {
  const latestRef = {
    current: {
      flow: { id: 'flow-1', revision: initialRevision, title: 'Flow' },
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
  const revisionRef = { current: initialRevision };
  const editGenerationRef = { current: 0 };
  const savingRef = { current: false };
  const pendingSaveRef = { current: false };
  const dirtyRef = { current: false };
  const saveTimerRef = { current: null };
  const statusRef = { current: { loading: false, conflict: false } };
  let conflict = false;

  const canScheduleSave = () => !statusRef.current.loading && !statusRef.current.conflict;

  const scheduleSave = (delayMs = FLOW_AUTOSAVE_DELAY_MS) => {
    scheduleAutosave({
      timerRef: saveTimerRef,
      delayMs,
      canSchedule: canScheduleSave,
      onFire: () => {
        void save();
      },
    });
  };

  const markDirty = () => {
    editGenerationRef.current += 1;
    dirtyRef.current = true;
    scheduleSave();
  };

  const setNodes = (updater) => {
    const next = typeof updater === 'function' ? updater(latestRef.current.nodes) : updater;
    latestRef.current = { ...latestRef.current, nodes: next };
    markDirty();
  };

  const save = async (options = {}) => {
    const { force = false } = options;
    if (saveTimerRef.current != null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!latestRef.current.flow) {
      return { saved: null, conflict: false, error: null };
    }
    if (!force && !dirtyRef.current) {
      return { saved: null, conflict: false, error: null };
    }
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return { saved: null, conflict: false, error: null };
    }

    const savingGeneration = editGenerationRef.current;
    savingRef.current = true;
    let needsFollowUp = false;
    try {
      const snapshot = latestRef.current;
      const saved = await saveFlow(snapshot.flow.id, {
        expectedRevision: snapshot.flow.revision,
        viewport: snapshot.viewport,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
      });
      const fresh = latestRef.current;
      syncFlowRevisionRefs(latestRef, revisionRef, saved);
      const changedDuringSave = editGenerationRef.current !== savingGeneration;
      latestRef.current.flow = changedDuringSave
        ? { ...latestRef.current.flow, revision: saved.revision, updatedAt: saved.updatedAt }
        : { ...latestRef.current.flow, ...saved };
      dirtyRef.current = changedDuringSave;
      needsFollowUp = changedDuringSave;
      conflict = false;
      await onCardRefresh?.(saved, fresh.nodes, fresh.edges);
      return { saved, conflict: false, error: null };
    } catch (error) {
      conflict = error.status === 409;
      if (!conflict && dirtyRef.current) {
        scheduleSave(FLOW_SAVE_RETRY_DELAY_MS);
      }
      return { saved: null, conflict, error };
    } finally {
      savingRef.current = false;
      if (needsFollowUp || pendingSaveRef.current) {
        pendingSaveRef.current = false;
        scheduleSave(FLOW_CHAINED_SAVE_DELAY_MS);
      }
    }
  };

  const flushSave = async () => {
    if (saveTimerRef.current != null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!latestRef.current.flow) {
      return { ok: true, conflict: false, error: null };
    }
    return runBoundedFlush({
      isActive: () => true,
      isDirty: () => dirtyRef.current,
      isSaving: () => savingRef.current,
      hasPending: () => pendingSaveRef.current,
      saveOnce: () => save({ force: true }),
    });
  };

  const setViewport = (viewport) => {
    latestRef.current = { ...latestRef.current, viewport };
    markDirty();
  };

  return {
    latestRef,
    revisionRef,
    dirtyRef,
    markDirty,
    setNodes,
    setViewport,
    save,
    flushSave,
    scheduleSave,
    saveTimerRef,
    getConflict: () => conflict,
  };
}

describe('useFlowDocument autosave orchestration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('autosaves once after repeated markDirty calls while dirty', async () => {
    const saveFlow = vi.fn(async (_flowId, snapshot) => ({
      id: 'flow-1',
      revision: snapshot.expectedRevision + 1,
      updatedAt: '2026-06-23T00:00:00.000Z',
    }));
    const harness = createSaveHarness({ saveFlow });

    harness.setViewport({ x: 10, y: 0, zoom: 1 });
    harness.setViewport({ x: 20, y: 0, zoom: 1 });
    harness.setViewport({ x: 30, y: 0, zoom: 1 });

    await vi.advanceTimersByTimeAsync(FLOW_AUTOSAVE_DELAY_MS);

    expect(saveFlow).toHaveBeenCalledTimes(1);
    expect(saveFlow.mock.calls[0][1].viewport).toEqual({ x: 30, y: 0, zoom: 1 });
    expect(harness.dirtyRef.current).toBe(false);
  });

  it('queues a follow-up save with the updated revision after edits during save', async () => {
    let resolveSave;
    const saveFlow = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSave = () => resolve({
          id: 'flow-1',
          revision: 2,
          updatedAt: '2026-06-23T00:00:00.000Z',
        });
      }))
      .mockImplementation(async (_flowId, snapshot) => ({
        id: 'flow-1',
        revision: snapshot.expectedRevision + 1,
        updatedAt: '2026-06-23T00:00:00.000Z',
      }));
    const harness = createSaveHarness({ saveFlow });

    harness.setViewport({ x: 5, y: 0, zoom: 1 });
    await vi.advanceTimersByTimeAsync(FLOW_AUTOSAVE_DELAY_MS);

    harness.setViewport({ x: 15, y: 0, zoom: 1 });
    resolveSave();
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(FLOW_CHAINED_SAVE_DELAY_MS);

    expect(saveFlow).toHaveBeenCalledTimes(2);
    expect(saveFlow.mock.calls[1][1].expectedRevision).toBe(2);
    expect(saveFlow.mock.calls[1][1].viewport).toEqual({ x: 15, y: 0, zoom: 1 });
  });

  it('flushSave persists dirty edits immediately', async () => {
    const saveFlow = vi.fn(async (_flowId, snapshot) => ({
      id: 'flow-1',
      revision: snapshot.expectedRevision + 1,
      updatedAt: '2026-06-23T00:00:00.000Z',
    }));
    const harness = createSaveHarness({ saveFlow });

    harness.setViewport({ x: 99, y: 0, zoom: 1 });
    const result = await harness.flushSave();

    expect(result.ok).toBe(true);
    expect(saveFlow).toHaveBeenCalledTimes(1);
    expect(saveFlow.mock.calls[0][1].viewport).toEqual({ x: 99, y: 0, zoom: 1 });
  });

  it('flushSave includes a node added via synchronous setNodes', async () => {
    const saveFlow = vi.fn(async (_flowId, snapshot) => ({
      id: 'flow-1',
      revision: snapshot.expectedRevision + 1,
      updatedAt: '2026-06-23T00:00:00.000Z',
    }));
    const harness = createSaveHarness({ saveFlow });
    const newNode = { id: 'node-1', type: 'local', position: { x: 10, y: 20 }, data: { title: 'Step' } };

    harness.setNodes((nodes) => [...nodes, newNode]);
    const result = await harness.flushSave();

    expect(result.ok).toBe(true);
    expect(saveFlow.mock.calls[0][1].nodes).toEqual([newNode]);
  });

  it('flushSave exits on 409 without exceeding max attempts', async () => {
    const saveFlow = vi.fn().mockRejectedValue(Object.assign(new Error('revision conflict'), { status: 409 }));
    const harness = createSaveHarness({ saveFlow });

    harness.setViewport({ x: 1, y: 0, zoom: 1 });
    const result = await harness.flushSave();

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(saveFlow).toHaveBeenCalledTimes(1);
    expect(saveFlow.mock.calls.length).toBeLessThanOrEqual(FLOW_FLUSH_MAX_ATTEMPTS);
  });

  it('flushSave exits when flow is unavailable', async () => {
    const saveFlow = vi.fn();
    const harness = createSaveHarness({ saveFlow });
    harness.latestRef.current.flow = null;
    harness.dirtyRef.current = true;

    const result = await harness.flushSave();

    expect(result.ok).toBe(true);
    expect(saveFlow).not.toHaveBeenCalled();
  });

  it('reschedules autosave after a non-409 save failure', async () => {
    const saveFlow = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('network'), { status: 500 }))
      .mockImplementation(async (_flowId, snapshot) => ({
        id: 'flow-1',
        revision: snapshot.expectedRevision + 1,
        updatedAt: '2026-06-23T00:00:00.000Z',
      }));
    const harness = createSaveHarness({ saveFlow });

    harness.setViewport({ x: 1, y: 0, zoom: 1 });
    await vi.advanceTimersByTimeAsync(FLOW_AUTOSAVE_DELAY_MS);
    expect(saveFlow).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(FLOW_SAVE_RETRY_DELAY_MS);
    expect(saveFlow).toHaveBeenCalledTimes(2);
  });

  it('onCardRefresh receives nodes added during an in-flight save on the chained save', async () => {
    let resolveSave;
    const onCardRefresh = vi.fn();
    const saveFlow = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSave = () => resolve({
          id: 'flow-1',
          revision: 2,
          updatedAt: '2026-06-23T00:00:00.000Z',
        });
      }))
      .mockImplementation(async (_flowId, snapshot) => ({
        id: 'flow-1',
        revision: snapshot.expectedRevision + 1,
        updatedAt: '2026-06-23T00:00:00.000Z',
      }));
    const harness = createSaveHarness({ saveFlow, onCardRefresh });
    const addedNode = { id: 'node-added', type: 'local', position: { x: 5, y: 6 }, data: { title: 'Added' } };

    harness.setViewport({ x: 1, y: 0, zoom: 1 });
    await vi.advanceTimersByTimeAsync(FLOW_AUTOSAVE_DELAY_MS);

    harness.setNodes((nodes) => [...nodes, addedNode]);
    resolveSave();
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(FLOW_CHAINED_SAVE_DELAY_MS);

    expect(saveFlow).toHaveBeenCalledTimes(2);
    expect(onCardRefresh).toHaveBeenCalledTimes(2);
    expect(onCardRefresh.mock.calls[1][1]).toEqual([addedNode]);
  });

  it('save skips when document is clean', async () => {
    const saveFlow = vi.fn(async (_flowId, snapshot) => ({
      id: 'flow-1',
      revision: snapshot.expectedRevision + 1,
      updatedAt: '2026-06-23T00:00:00.000Z',
    }));
    const harness = createSaveHarness({ saveFlow });

    await harness.save();

    expect(saveFlow).not.toHaveBeenCalled();
  });

  it('save clears a pending autosave timer', async () => {
    const saveFlow = vi.fn(async (_flowId, snapshot) => ({
      id: 'flow-1',
      revision: snapshot.expectedRevision + 1,
      updatedAt: '2026-06-23T00:00:00.000Z',
    }));
    const harness = createSaveHarness({ saveFlow });

    harness.setViewport({ x: 1, y: 0, zoom: 1 });
    expect(harness.saveTimerRef.current).not.toBeNull();

    await harness.save({ force: true });
    harness.dirtyRef.current = false;

    await vi.advanceTimersByTimeAsync(FLOW_AUTOSAVE_DELAY_MS);
    expect(saveFlow).toHaveBeenCalledTimes(1);
  });

  it('flushSave still saves dirty nodes after a clean save was skipped', async () => {
    const saveFlow = vi.fn(async (_flowId, snapshot) => ({
      id: 'flow-1',
      revision: snapshot.expectedRevision + 1,
      updatedAt: '2026-06-23T00:00:00.000Z',
    }));
    const harness = createSaveHarness({ saveFlow });
    const newNode = { id: 'node-2', type: 'local', position: { x: 1, y: 2 }, data: { title: 'Step' } };

    harness.setNodes((nodes) => [...nodes, newNode]);
    await harness.save();
    expect(saveFlow).toHaveBeenCalledTimes(1);
    expect(saveFlow.mock.calls[0][1].nodes).toEqual([newNode]);
  });
});

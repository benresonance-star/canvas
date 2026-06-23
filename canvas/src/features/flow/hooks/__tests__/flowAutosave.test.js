import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  FLOW_AUTOSAVE_DELAY_MS,
  FLOW_CHAINED_SAVE_DELAY_MS,
  FLOW_FLUSH_MAX_ATTEMPTS,
  FLOW_SAVE_RETRY_DELAY_MS,
  clearAutosaveTimer,
  runBoundedFlush,
  scheduleAutosave,
  syncFlowRevisionRefs,
} from '../flowAutosave.js';

describe('flowAutosave scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once after repeated schedules within the debounce window', () => {
    const timerRef = { current: null };
    const onFire = vi.fn();

    scheduleAutosave({
      timerRef,
      delayMs: FLOW_AUTOSAVE_DELAY_MS,
      canSchedule: () => true,
      onFire,
    });
    scheduleAutosave({
      timerRef,
      delayMs: FLOW_AUTOSAVE_DELAY_MS,
      canSchedule: () => true,
      onFire,
    });
    scheduleAutosave({
      timerRef,
      delayMs: FLOW_AUTOSAVE_DELAY_MS,
      canSchedule: () => true,
      onFire,
    });

    vi.advanceTimersByTime(FLOW_AUTOSAVE_DELAY_MS - 1);
    expect(onFire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('does not schedule when canSchedule returns false', () => {
    const timerRef = { current: null };
    const onFire = vi.fn();

    scheduleAutosave({
      timerRef,
      delayMs: FLOW_AUTOSAVE_DELAY_MS,
      canSchedule: () => false,
      onFire,
    });

    vi.advanceTimersByTime(FLOW_AUTOSAVE_DELAY_MS);
    expect(onFire).not.toHaveBeenCalled();
    expect(timerRef.current).toBeNull();
  });

  it('clearAutosaveTimer cancels a pending save', () => {
    const timerRef = { current: null };
    const onFire = vi.fn();

    scheduleAutosave({
      timerRef,
      delayMs: FLOW_AUTOSAVE_DELAY_MS,
      canSchedule: () => true,
      onFire,
    });
    clearAutosaveTimer(timerRef);
    vi.advanceTimersByTime(FLOW_AUTOSAVE_DELAY_MS);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('supports chained and retry delays', () => {
    const timerRef = { current: null };
    const onFire = vi.fn();

    scheduleAutosave({
      timerRef,
      delayMs: FLOW_CHAINED_SAVE_DELAY_MS,
      canSchedule: () => true,
      onFire,
    });
    vi.advanceTimersByTime(FLOW_CHAINED_SAVE_DELAY_MS);
    expect(onFire).toHaveBeenCalledTimes(1);

    scheduleAutosave({
      timerRef,
      delayMs: FLOW_SAVE_RETRY_DELAY_MS,
      canSchedule: () => true,
      onFire,
    });
    vi.advanceTimersByTime(FLOW_SAVE_RETRY_DELAY_MS);
    expect(onFire).toHaveBeenCalledTimes(2);
  });
});

describe('syncFlowRevisionRefs', () => {
  it('updates revision refs synchronously after save', () => {
    const latestRef = {
      current: {
        flow: { id: 'flow-1', revision: 3, title: 'Flow' },
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };
    const revisionRef = { current: 3 };
    const saved = { revision: 4, updatedAt: '2026-06-23T00:00:00.000Z' };

    syncFlowRevisionRefs(latestRef, revisionRef, saved);

    expect(revisionRef.current).toBe(4);
    expect(latestRef.current.flow.revision).toBe(4);
    expect(latestRef.current.flow.updatedAt).toBe(saved.updatedAt);
  });
});

describe('runBoundedFlush', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops after a conflict instead of looping', async () => {
    const saveOnce = vi.fn().mockResolvedValue({
      saved: null,
      conflict: true,
      error: new Error('revision conflict'),
    });
    const dirtyRef = { current: true };

    const resultPromise = runBoundedFlush({
      isActive: () => true,
      isDirty: () => dirtyRef.current,
      isSaving: () => false,
      hasPending: () => false,
      saveOnce,
    });
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(saveOnce).toHaveBeenCalledTimes(1);
  });

  it('caps save attempts when dirty remains true', async () => {
    const dirtyRef = { current: true };
    const saveOnce = vi.fn().mockResolvedValue({
      saved: null,
      conflict: false,
      error: new Error('network'),
    });

    const result = await runBoundedFlush({
      isActive: () => true,
      isDirty: () => dirtyRef.current,
      isSaving: () => false,
      hasPending: () => false,
      saveOnce,
      maxAttempts: FLOW_FLUSH_MAX_ATTEMPTS,
    });

    expect(result.ok).toBe(false);
    expect(saveOnce).toHaveBeenCalledTimes(FLOW_FLUSH_MAX_ATTEMPTS);
  });
});

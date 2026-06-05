import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSyncTraceId,
  flowTrace,
  isSyncTraceEnabled,
  summarizePatchOps,
  syncTraceLog,
} from '../syncTrace.js';

describe('syncTrace', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createSyncTraceId returns a non-empty string', () => {
    expect(createSyncTraceId()).toMatch(/^[a-z0-9-]+$/i);
  });

  it('syncTraceLog is silent when disabled', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    syncTraceLog('tid', 'test', { x: 1 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('isSyncTraceEnabled accepts legacy canvas:sync-trace key', () => {
    localStorage.getItem.mockImplementation((key) =>
      key === 'canvas:sync-trace' ? '1' : null,
    );
    expect(isSyncTraceEnabled()).toBe(true);
  });

  it('syncTraceLog emits when enabled', () => {
    localStorage.getItem.mockImplementation((key) =>
      key === 'canvas-sync-trace' ? '1' : null,
    );
    expect(isSyncTraceEnabled()).toBe(true);
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    syncTraceLog('tid-1', 'stage', { projectId: 'p' });
    expect(spy).toHaveBeenCalledWith(
      '[canvas:sync-trace]',
      expect.stringContaining('"traceId":"tid-1"'),
    );
    spy.mockRestore();
  });

  it('flowTrace uses projectId as traceId', () => {
    localStorage.getItem.mockImplementation((key) =>
      key === 'canvas-sync-trace' ? '1' : null,
    );
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    flowTrace('project:create-start', { projectId: 'proj-1', name: 'Test' });
    expect(spy).toHaveBeenCalledWith(
      '[canvas:sync-trace]',
      expect.stringContaining('"traceId":"proj-1"'),
    );
    spy.mockRestore();
  });

  it('summarizePatchOps dedupes op types', () => {
    expect(
      summarizePatchOps([
        { op: 'setPlacement' },
        { op: 'upsertCard' },
        { op: 'setPlacement' },
      ]),
    ).toEqual({ count: 3, types: ['setPlacement', 'upsertCard'] });
  });
});

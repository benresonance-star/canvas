import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isPlacementAuditEnabled, auditPlacementStep } from '../placementAudit.js';

describe('placementAudit', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      if (typeof localStorage?.removeItem === 'function') {
        localStorage.removeItem('canvas-placement-audit');
      }
    } catch {
      /* vitest may stub localStorage */
    }
  });

  it('is disabled by default', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    expect(isPlacementAuditEnabled()).toBe(false);
    auditPlacementStep('test', { cards: [], stagedSyncCards: [] });
    expect(console.debug).not.toHaveBeenCalled();
  });

  it('logs surface keys when enabled', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((k) => (k === 'canvas-placement-audit' ? '1' : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    auditPlacementStep('transfer', {
      cards: [{ id: 'c1', key: 'notes__a', versions: [{ filename: 'notes__a-v1.md' }] }],
      stagedSyncCards: [],
      artifactPlacements: {
        notes__a: { surface: 'canvas' },
      },
    });
    expect(console.debug).toHaveBeenCalledWith(
      '[placement-audit]',
      'transfer',
      expect.objectContaining({
        mapCanvas: ['notes__a'],
        arrayCanvas: ['notes__a'],
      }),
    );
  });
});

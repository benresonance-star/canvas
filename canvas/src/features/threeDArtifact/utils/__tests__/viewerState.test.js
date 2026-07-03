import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THREE_D_VIEWER_STATE,
  normalizeThreeDViewerState,
} from '../viewerState.js';

describe('normalizeThreeDViewerState', () => {
  it('defaults cameraSaved to false so models auto-fit', () => {
    expect(normalizeThreeDViewerState(null).cameraSaved).toBe(false);
    expect(DEFAULT_THREE_D_VIEWER_STATE.cameraSaved).toBe(false);
  });

  it('preserves cameraSaved when explicitly saved', () => {
    const normalized = normalizeThreeDViewerState({
      cameraSaved: true,
      camera: {
        position: [1, 2, 3],
        target: [0, 0, 0],
      },
    });
    expect(normalized.cameraSaved).toBe(true);
    expect(normalized.camera.position).toEqual([1, 2, 3]);
  });

  it('derives environmentPreset from lightingMode for legacy viewer state', () => {
    expect(normalizeThreeDViewerState({ lightingMode: 'soft' }).environmentPreset).toBe('sunset');
    expect(normalizeThreeDViewerState({ environmentPreset: 'city' }).lightingMode).toBe('bright');
  });
});

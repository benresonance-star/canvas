import { describe, expect, it } from 'vitest';
import {
  chunkLocalIds,
  GHOST_OTHERS_BATCH_SIZE,
  isFragmentsRaycastHit,
  isPickSuperseded,
  PICK_DRAG_THRESHOLD_PX,
  resolveFragmentsPickLocalIds,
  shouldApplySelectionRun,
  shouldSuppressPickFromDrag,
} from '../bimPickPipeline.js';

describe('bimPickPipeline', () => {
  it('treats empty raycast results as a viewport miss', () => {
    expect(isFragmentsRaycastHit(null)).toBe(false);
    expect(isFragmentsRaycastHit({ localId: -1, itemId: -1 })).toBe(false);
    expect(isFragmentsRaycastHit({ localId: 3, itemId: 99 })).toBe(true);
    expect(isFragmentsRaycastHit({ itemId: 7 })).toBe(true);
  });

  it('collects unique fragment local ids from raycast hits', () => {
    expect(resolveFragmentsPickLocalIds({ localId: 3, itemId: 99 })).toEqual([99, 3]);
    expect(resolveFragmentsPickLocalIds({ localId: 3, itemId: 3 })).toEqual([3]);
    expect(resolveFragmentsPickLocalIds(null)).toEqual([]);
  });

  it('suppresses pick when pointer drag exceeds threshold', () => {
    expect(shouldSuppressPickFromDrag({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false);
    expect(shouldSuppressPickFromDrag({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false);
    expect(shouldSuppressPickFromDrag({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(true);
    expect(shouldSuppressPickFromDrag(null, { x: 0, y: 0 })).toBe(false);
  });

  it('uses the configured drag threshold', () => {
    expect(PICK_DRAG_THRESHOLD_PX).toBe(5);
    expect(shouldSuppressPickFromDrag({ x: 0, y: 0 }, { x: 5, y: 0 }, 5)).toBe(false);
    expect(shouldSuppressPickFromDrag({ x: 0, y: 0 }, { x: 5.1, y: 0 }, 5)).toBe(true);
  });

  it('detects superseded pick sequences', () => {
    expect(isPickSuperseded(1, 1)).toBe(false);
    expect(isPickSuperseded(1, 2)).toBe(true);
  });

  it('allows only the latest applySelection run', () => {
    expect(shouldApplySelectionRun(3, 3)).toBe(true);
    expect(shouldApplySelectionRun(2, 3)).toBe(false);
  });

  it('chunks local IDs for progressive ghost highlighting', () => {
    const localIds = Array.from({ length: GHOST_OTHERS_BATCH_SIZE + 3 }, (_, index) => index);
    const chunks = chunkLocalIds(localIds);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(GHOST_OTHERS_BATCH_SIZE);
    expect(chunks[1]).toEqual([GHOST_OTHERS_BATCH_SIZE, GHOST_OTHERS_BATCH_SIZE + 1, GHOST_OTHERS_BATCH_SIZE + 2]);
  });
});

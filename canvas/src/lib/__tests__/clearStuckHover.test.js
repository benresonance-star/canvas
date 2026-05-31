import { describe, expect, it, vi, afterEach } from 'vitest';
import { clearStuckPointerHover } from '../clearStuckHover.js';

describe('clearStuckPointerHover', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores body pointer-events after hit-test', () => {
    const style = { pointerEvents: 'auto' };
    const body = { style };
    const removeAllRanges = vi.fn();
    const group = {
      classList: { contains: (c) => c === 'group' },
      parentElement: body,
      dispatchEvent: vi.fn(),
    };
    vi.stubGlobal('MouseEvent', class MouseEvent {});
    vi.stubGlobal('window', {
      getSelection: () => ({ removeAllRanges }),
    });
    vi.stubGlobal('document', {
      body,
      elementFromPoint: vi.fn(),
      elementsFromPoint: vi.fn(() => [group]),
    });

    clearStuckPointerHover(10, 20);

    expect(document.elementFromPoint).toHaveBeenCalledWith(10, 20);
    expect(body.style.pointerEvents).toBe('auto');
    expect(group.dispatchEvent).toHaveBeenCalled();
    expect(removeAllRanges).toHaveBeenCalled();
  });

  it('is a no-op when document is unavailable', () => {
    vi.stubGlobal('document', undefined);
    expect(() => clearStuckPointerHover(100, 200)).not.toThrow();
  });
});

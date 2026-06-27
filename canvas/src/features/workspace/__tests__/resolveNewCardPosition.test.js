import { describe, expect, it } from 'vitest';
import { resolveNewCardPosition } from '../resolveNewCardPosition.js';

describe('resolveNewCardPosition', () => {
  it('uses pending placement when provided', () => {
    const result = resolveNewCardPosition({
      pendingPlacement: { x: 420, y: 180 },
      cardCount: 3,
    });
    expect(result).toMatchObject({ x: 420, y: 180, usedPending: true });
  });

  it('falls back to grid placement', () => {
    const result = resolveNewCardPosition({
      cardCount: 5,
      mode: 'grid',
    });
    expect(result).toMatchObject({ x: 420, y: 340, usedPending: false });
  });

  it('falls back to viewport center with offset', () => {
    const result = resolveNewCardPosition({
      cardCount: 0,
      canvasView: { x: 100, y: 50, zoom: 2 },
      viewportSize: { width: 1000, height: 800 },
      offset: { x: -20, y: -10 },
      mode: 'center',
    });
    expect(result).toMatchObject({
      x: (1000 / 2 - 100) / 2 - 20,
      y: (800 / 2 - 50) / 2 - 10,
      usedPending: false,
    });
  });
});

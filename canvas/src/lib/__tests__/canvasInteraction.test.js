import { describe, it, expect, beforeEach } from 'vitest';
import {
  beginCanvasInteraction,
  endCanvasInteraction,
  isCanvasInteractionActive,
  resetCanvasInteractionForTests,
} from '../canvasInteraction.js';

describe('canvasInteraction', () => {
  beforeEach(() => {
    resetCanvasInteractionForTests();
  });

  it('tracks nested interactions', () => {
    expect(isCanvasInteractionActive()).toBe(false);
    beginCanvasInteraction('card');
    expect(isCanvasInteractionActive()).toBe(true);
    beginCanvasInteraction('pan');
    expect(isCanvasInteractionActive()).toBe(true);
    endCanvasInteraction('pan');
    expect(isCanvasInteractionActive()).toBe(true);
    endCanvasInteraction('card');
    expect(isCanvasInteractionActive()).toBe(false);
  });
});

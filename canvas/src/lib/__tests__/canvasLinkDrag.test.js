import { describe, expect, it } from 'vitest';
import { cardDragIgnoresTarget, artifactRefFromPinnedVersion } from '../canvasLinkDrag.js';

function mockTarget(selectors) {
  return {
    closest(sel) {
      return selectors.includes(sel) ? {} : null;
    },
  };
}

describe('cardDragIgnoresTarget', () => {
  it('ignores resize handles', () => {
    expect(cardDragIgnoresTarget(mockTarget(['[data-card-resize-handle]']))).toBe(true);
  });

  it('ignores link handles', () => {
    expect(cardDragIgnoresTarget(mockTarget(['[data-link-handle]']))).toBe(true);
  });

  it('does not ignore card body', () => {
    expect(cardDragIgnoresTarget(mockTarget([]))).toBe(false);
  });

  it('ignores inline edit surfaces', () => {
    expect(cardDragIgnoresTarget(mockTarget(['[data-card-interactive-edit]']))).toBe(true);
  });

  it('ignores artifact scroll surfaces', () => {
    expect(cardDragIgnoresTarget(mockTarget(['[data-artifact-scroll]']))).toBe(true);
  });

  it('ignores artifact control surfaces', () => {
    expect(cardDragIgnoresTarget(mockTarget(['[data-card-artifact-controls]']))).toBe(true);
  });
});

describe('artifactRefFromPinnedVersion', () => {
  it('returns ref when id is present', () => {
    const ref = { id: '01H', type: 'artifact' };
    expect(artifactRefFromPinnedVersion({ artifactRef: ref })).toEqual(ref);
  });

  it('returns null when ref missing', () => {
    expect(artifactRefFromPinnedVersion({})).toBeNull();
  });
});

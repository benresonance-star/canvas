import { describe, expect, it } from 'vitest';
import { studioCardFromOverview, studioIdFromCard } from '../studioCard.js';

describe('studioCard', () => {
  it('projects child studio metadata onto canvas cards', () => {
    const card = studioCardFromOverview({
      studio: {
        id: 'child-1',
        title: 'Metaphase Deep Dive',
        studioKind: 'cognitive',
        state: 'seeded',
        parentStudioId: 'parent-1',
      },
      parentStudio: {
        id: 'parent-1',
        title: 'Cell Mitosis Studio',
      },
      surfaces: [{ id: 'surface-1', artifactId: 'flow-1', isPrimary: true }],
      counts: { runs: 0 },
    });

    expect(card.parentStudioId).toBe('parent-1');
    expect(card.parentStudioTitle).toBe('Cell Mitosis Studio');
    expect(card.primaryFlowId).toBe('flow-1');
    expect(studioIdFromCard(card)).toBe('child-1');
  });
});

import { describe, expect, it } from 'vitest';
import {
  boundsForMemberCards,
  buildClusterHulls,
  chromeLayoutForBounds,
  clusterNestingDepth,
  CLUSTER_CHROME_HANDLE_SIZE,
  CLUSTER_CHROME_LABEL_MAX_WIDTH,
} from '../clusterHull.js';

describe('boundsForMemberCards', () => {
  it('returns padded union of card rects', () => {
    const bounds = boundsForMemberCards([
      { x: 100, y: 50, width: 200, height: 100, type: 'file' },
      { x: 400, y: 80, width: 100, height: 80, type: 'file' },
    ]);
    expect(bounds.minX).toBe(84);
    expect(bounds.minY).toBe(34);
    expect(bounds.maxX).toBe(516);
    expect(bounds.maxY).toBe(176);
  });
});

describe('chromeLayoutForBounds', () => {
  it('places chrome row centered above hull top', () => {
    const bounds = { minX: 0, minY: 100, maxX: 200, maxY: 300 };
    const chrome = chromeLayoutForBounds(bounds);
    const rowWidth =
      CLUSTER_CHROME_HANDLE_SIZE + 4 + CLUSTER_CHROME_LABEL_MAX_WIDTH;
    expect(chrome.centerX).toBe(100);
    expect(chrome.chromeLeft).toBe(100 - rowWidth / 2);
    expect(chrome.handleY).toBe(90 - 28);
    expect(chrome.labelX).toBe(chrome.handleX + CLUSTER_CHROME_HANDLE_SIZE + 4);
  });
});

describe('clusterNestingDepth', () => {
  it('counts depth below workspace', () => {
    const ws = 'ws';
    const a = { id: 'a', parent_cluster_id: ws };
    const b = { id: 'b', parent_cluster_id: 'a' };
    const byId = new Map([
      ['a', a],
      ['b', b],
    ]);
    expect(clusterNestingDepth(a, byId, ws)).toBe(0);
    expect(clusterNestingDepth(b, byId, ws)).toBe(1);
  });
});

describe('buildClusterHulls', () => {
  it('includes memberCardIds and chrome positions', () => {
    const cards = [
      {
        id: 'c1',
        key: 'k1',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        type: 'file',
        pinnedVersion: 1,
        versions: [{ version: 1, artifactRef: { id: 'a1', type: 'artifact' } }],
      },
    ];
    const hulls = buildClusterHulls({
      clusters: [{ id: 'cl1', name: 'Townhouses' }],
      membersByClusterId: new Map([['cl1', [{ id: 'a1', type: 'artifact' }]]]),
      cards,
    });
    expect(hulls).toHaveLength(1);
    expect(hulls[0].name).toBe('Townhouses');
    expect(hulls[0].memberCardIds).toEqual(['c1']);
    expect(hulls[0].centerX).toBeDefined();
    expect(hulls[0].handleX).toBeDefined();
    expect(hulls[0].labelX).toBeDefined();
    expect(hulls[0].depth).toBe(0);
  });

  it('pathD updates when member card position changes', () => {
    const clusters = [{ id: 'cl1', name: 'Townhouses' }];
    const membersByClusterId = new Map([
      ['cl1', [{ id: 'a1', type: 'artifact' }]],
    ]);
    const baseCard = {
      id: 'c1',
      key: 'k1',
      width: 100,
      height: 100,
      type: 'file',
      pinnedVersion: 1,
      versions: [{ version: 1, artifactRef: { id: 'a1', type: 'artifact' } }],
    };
    const atOrigin = buildClusterHulls({
      clusters,
      membersByClusterId,
      cards: [{ ...baseCard, x: 0, y: 0 }],
    });
    const offset = buildClusterHulls({
      clusters,
      membersByClusterId,
      cards: [{ ...baseCard, x: 200, y: 150 }],
    });
    expect(atOrigin).toHaveLength(1);
    expect(offset).toHaveLength(1);
    expect(atOrigin[0].pathD).not.toBe(offset[0].pathD);
    expect(offset[0].centerX).toBeGreaterThan(atOrigin[0].centerX);
  });
});

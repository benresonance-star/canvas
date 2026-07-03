import { describe, expect, it } from 'vitest';
import { buildFlowNeighborhoodFocus, buildGhostedFlowPathIds } from '../flowNeighborhoodFocus.js';

describe('buildFlowNeighborhoodFocus', () => {
  const nodes = ['idea', 'review', 'research', 'report', 'spec', 'external'].map((id) => ({ id }));
  const edges = [
    { id: 'idea-review', source: 'idea', target: 'review' },
    { id: 'review-research', source: 'review', target: 'research' },
    { id: 'research-report', source: 'research', target: 'report' },
    { id: 'report-spec', source: 'report', target: 'spec' },
    { id: 'spec-external', source: 'spec', target: 'external' },
  ];

  it('keeps selected nodes and their direct upstream and downstream nodes visible', () => {
    const focus = buildFlowNeighborhoodFocus({ nodes, edges, selectedNodeIds: ['research'] });

    expect(focus.active).toBe(true);
    expect([...focus.visibleNodeIds].sort()).toEqual(['report', 'research', 'review']);
    expect([...focus.ghostedNodeIds].sort()).toEqual(['external', 'idea', 'spec']);
    expect([...focus.activeEdgeIds].sort()).toEqual(['research-report', 'review-research']);
    expect([...focus.ghostedEdgeIds].sort()).toEqual(['idea-review', 'report-spec', 'spec-external']);
  });

  it('supports multi-selection without including second-hop nodes', () => {
    const focus = buildFlowNeighborhoodFocus({ nodes, edges, selectedNodeIds: ['review', 'report'] });

    expect([...focus.visibleNodeIds].sort()).toEqual(['idea', 'report', 'research', 'review', 'spec']);
    expect([...focus.ghostedNodeIds]).toEqual(['external']);
    expect([...focus.activeEdgeIds].sort()).toEqual([
      'idea-review',
      'report-spec',
      'research-report',
      'review-research',
    ]);
    expect([...focus.ghostedEdgeIds]).toEqual(['spec-external']);
  });

  it('is inactive when no selected id exists in the graph', () => {
    const focus = buildFlowNeighborhoodFocus({ nodes, edges, selectedNodeIds: ['missing'] });

    expect(focus.active).toBe(false);
    expect(focus.visibleNodeIds.size).toBe(0);
    expect(focus.ghostedNodeIds.size).toBe(0);
  });
});

describe('buildGhostedFlowPathIds', () => {
  it('ghosts paths that do not intersect visible nodes', () => {
    const ghosted = buildGhostedFlowPathIds(
      [
        { id: 'path-a', stepIds: ['idea', 'review'] },
        { id: 'path-b', stepIds: ['external'] },
      ],
      new Set(['review', 'research']),
    );

    expect([...ghosted]).toEqual(['path-b']);
  });
});

import { describe, expect, it } from 'vitest';
import { buildFlowPlaybackSequence, nextFlowPlaybackIndex } from '../flowPlayback.js';

const nodes = [
  { id: 'idea', position: { x: 0, y: 0 } },
  { id: 'review', position: { x: 100, y: 0 } },
  { id: 'research', position: { x: 200, y: 0 } },
  { id: 'spec', position: { x: 300, y: 0 } },
];

const edges = [
  { id: 'e1', source: 'idea', target: 'review' },
  { id: 'e2', source: 'review', target: 'research' },
  { id: 'e3', source: 'research', target: 'spec' },
];

describe('buildFlowPlaybackSequence', () => {
  it('uses the selected path first', () => {
    const sequence = buildFlowPlaybackSequence({
      paths: [
        { id: 'p1', name: 'First', stepIds: ['idea'] },
        { id: 'p2', name: 'Second', stepIds: ['review', 'research'] },
      ],
      nodes,
      edges,
      selectedPathId: 'p2',
    });

    expect(sequence.pathId).toBe('p2');
    expect(sequence.stepIds).toEqual(['review', 'research']);
  });

  it('falls back to the path containing the selected node', () => {
    const sequence = buildFlowPlaybackSequence({
      paths: [
        { id: 'p1', name: 'First', stepIds: ['idea'] },
        { id: 'p2', name: 'Second', stepIds: ['review', 'research'] },
      ],
      nodes,
      edges,
      selectedNodeId: 'research',
    });

    expect(sequence.pathId).toBe('p2');
  });

  it('uses the full graph when no paths exist', () => {
    const sequence = buildFlowPlaybackSequence({ nodes, edges });

    expect(sequence.pathId).toBeNull();
    expect(sequence.stepIds).toEqual(['idea', 'review', 'research', 'spec']);
  });

  it('does not append supporting upstream inputs after the downstream terminal step', () => {
    const sequence = buildFlowPlaybackSequence({
      paths: [
        {
          id: 'p1',
          name: 'Branched',
          stepIds: ['idea', 'review', 'research', 'report', 'skill', 'generator'],
        },
      ],
      nodes: [
        { id: 'idea', position: { x: 0, y: 0 } },
        { id: 'skill', position: { x: 120, y: 200 } },
        { id: 'review', position: { x: 220, y: 0 } },
        { id: 'research', position: { x: 440, y: 0 } },
        { id: 'report', position: { x: 660, y: 120 } },
        { id: 'generator', position: { x: 880, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'idea', target: 'review' },
        { id: 'e2', source: 'review', target: 'research' },
        { id: 'e3', source: 'research', target: 'report' },
        { id: 'e4', source: 'skill', target: 'report' },
        { id: 'e5', source: 'report', target: 'generator' },
      ],
    });

    expect(sequence.stepIds.at(-1)).toBe('generator');
    expect(sequence.stepIds.indexOf('skill')).toBeLessThan(sequence.stepIds.indexOf('report'));
  });
});

describe('nextFlowPlaybackIndex', () => {
  it('starts at the first step and completes at the final step', () => {
    expect(nextFlowPlaybackIndex(null, 3)).toEqual({ index: 0, complete: false });
    expect(nextFlowPlaybackIndex(1, 3)).toEqual({ index: 2, complete: true });
    expect(nextFlowPlaybackIndex(2, 3)).toEqual({ index: 2, complete: true });
  });
});

import { describe, expect, it } from 'vitest';
import {
  pathStepDisplayTitle,
  resolvePathCurrentActiveStepIdInSequence,
  resolvePathCurrentActiveStepTitle,
} from '../flowPathStepDisplay.js';

describe('flowPathStepDisplay', () => {
  it('resolvePathCurrentActiveStepIdInSequence uses flow order', () => {
    const path = {
      stepIds: ['c', 'a', 'b'],
      stepRunStates: { b: 'current' },
    };
    const nodesById = new Map([
      ['a', { id: 'a', type: 'local', position: { x: 0, y: 0 }, data: { title: 'A' } }],
      ['b', { id: 'b', type: 'local', position: { x: 100, y: 0 }, data: { title: 'B' } }],
      ['c', { id: 'c', type: 'local', position: { x: 200, y: 0 }, data: { title: 'C' } }],
    ]);
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ];
    expect(resolvePathCurrentActiveStepIdInSequence(path, edges, nodesById)).toBe('b');
  });

  it('resolvePathCurrentActiveStepTitle returns step title', () => {
    const path = {
      stepIds: ['idea'],
      stepRunStates: { idea: 'current' },
    };
    const nodesById = new Map([
      ['idea', { id: 'idea', type: 'local', position: { x: 0, y: 0 }, data: { title: 'IDEA' } }],
    ]);
    expect(resolvePathCurrentActiveStepTitle(path, [], nodesById)).toBe('IDEA');
  });

  it('pathStepDisplayTitle resolves artifact filenames', () => {
    expect(pathStepDisplayTitle({
      type: 'artifact',
      data: { displayFilename: 'brief.md' },
    })).toBe('brief.md');
  });
});

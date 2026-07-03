import { describe, expect, it } from 'vitest';
import {
  buildFlowNodeSelectionChanges,
  resolveFlowNodeClickSelection,
  selectionsHaveSameNodeIds,
} from '../FlowEditorSelection.js';

describe('FlowEditor selection helpers', () => {
  it('adds shift-clicked nodes to the current selection', () => {
    expect(resolveFlowNodeClickSelection(['a'], 'b', true)).toEqual(['a', 'b']);
  });

  it('toggles additive node selection off when the node is already selected', () => {
    expect(resolveFlowNodeClickSelection(['a', 'b'], 'a', true)).toEqual(['b']);
  });

  it('replaces selection for normal node clicks', () => {
    expect(resolveFlowNodeClickSelection(['a', 'b'], 'c', false)).toEqual(['c']);
  });

  it('builds non-dirty React Flow selection changes only for changed nodes', () => {
    const nodes = [
      { id: 'a', selected: true },
      { id: 'b', selected: false },
      { id: 'c' },
    ];

    expect(buildFlowNodeSelectionChanges(nodes, ['a', 'c'])).toEqual([
      { id: 'c', type: 'select', selected: true },
    ]);
  });

  it('compares selected node ids without depending on order', () => {
    expect(selectionsHaveSameNodeIds(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(selectionsHaveSameNodeIds(['a', 'b'], ['a'])).toBe(false);
  });
});

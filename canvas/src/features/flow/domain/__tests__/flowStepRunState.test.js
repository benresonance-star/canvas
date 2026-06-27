import { describe, expect, it } from 'vitest';
import {
  buildPathRunStateByStepId,
  DEFAULT_FLOW_STEP_RUN_STATE,
  flowStepRunStateMeta,
  normalizeFlowStepRunState,
  normalizePathStepRunStates,
  resolvePathCurrentActiveStepId,
  resolvePathStepRunState,
} from '../flowStepRunState.js';

describe('flowStepRunState', () => {
  it('normalizeFlowStepRunState falls back to not_started', () => {
    expect(normalizeFlowStepRunState('complete')).toBe('complete');
    expect(normalizeFlowStepRunState('bogus')).toBe(DEFAULT_FLOW_STEP_RUN_STATE);
  });

  it('flowStepRunStateMeta returns glyph and label', () => {
    expect(flowStepRunStateMeta('current')).toEqual({
      id: 'current',
      glyph: '●',
      label: 'Current / waiting',
    });
  });

  it('normalizePathStepRunStates keeps only member steps', () => {
    expect(normalizePathStepRunStates({
      a: 'complete',
      b: 'current',
      c: 'failed',
    }, ['a', 'b'])).toEqual({
      a: 'complete',
      b: 'current',
    });
  });

  it('resolvePathStepRunState returns null for non-members', () => {
    const path = { stepIds: ['a'], stepRunStates: { a: 'complete' } };
    expect(resolvePathStepRunState(path, 'a')).toBe('complete');
    expect(resolvePathStepRunState(path, 'b')).toBeNull();
    expect(resolvePathStepRunState(path, 'missing')).toBeNull();
  });

  it('resolvePathCurrentActiveStepId returns first current step in path order', () => {
    const path = {
      stepIds: ['a', 'b', 'c'],
      stepRunStates: { b: 'current', c: 'current' },
    };
    expect(resolvePathCurrentActiveStepId(path)).toBe('b');
    expect(resolvePathCurrentActiveStepId({ stepIds: ['a'] })).toBeNull();
  });

  it('buildPathRunStateByStepId maps all path members', () => {
    const map = buildPathRunStateByStepId([
      { id: 'p1', stepIds: ['a', 'b'], stepRunStates: { b: 'complete' } },
    ]);
    expect(map.get('a')).toBe('not_started');
    expect(map.get('b')).toBe('complete');
    expect(map.has('c')).toBe(false);
  });
});

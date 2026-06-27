import { describe, expect, it } from 'vitest';
import {
  FLOW_LOCAL_NODE_TYPE_DEFAULT_COLORS,
  normalizeFlowLocalNodeTypeColors,
  patchFlowLocalNodeTypeColor,
  resolveFlowLocalNodeTypeColor,
  validateFlowLocalNodeTypeColors,
} from '../flowLocalNodeTypeColors.js';

describe('flowLocalNodeTypeColors', () => {
  it('returns defaults when colors are missing', () => {
    expect(normalizeFlowLocalNodeTypeColors(undefined)).toEqual({
      ...FLOW_LOCAL_NODE_TYPE_DEFAULT_COLORS,
    });
  });

  it('migrates retired step colors to decision and drops unknown keys', () => {
    const colors = normalizeFlowLocalNodeTypeColors({
      step: '#112233',
      agent: '#abcdef',
    });
    expect(colors.decision).toBe('#112233');
    expect(colors.step).toBeUndefined();
    expect(colors.artifact).toBe(FLOW_LOCAL_NODE_TYPE_DEFAULT_COLORS.artifact);
    expect(colors.agent).toBeUndefined();
  });

  it('patches a single type color', () => {
    const next = patchFlowLocalNodeTypeColor({}, 'decision', '#abcdef');
    expect(next.decision).toBe('#abcdef');
  });

  it('resolves color for a type id and maps legacy types to artifact color', () => {
    expect(resolveFlowLocalNodeTypeColor({ decision: '#101010' }, 'decision')).toBe('#101010');
    expect(resolveFlowLocalNodeTypeColor({ step: '#101010' }, 'step')).toBe('#101010');
    expect(resolveFlowLocalNodeTypeColor({}, 'decision')).toBe(FLOW_LOCAL_NODE_TYPE_DEFAULT_COLORS.decision);
    expect(resolveFlowLocalNodeTypeColor({ artifact: '#222222' }, 'agent')).toBe('#222222');
  });

  it('validates color maps and ignores legacy keys', () => {
    expect(() => validateFlowLocalNodeTypeColors({ step: '#123456' })).not.toThrow();
    expect(() => validateFlowLocalNodeTypeColors({ agent: '#123456' })).not.toThrow();
    expect(() => validateFlowLocalNodeTypeColors({ decision: 'not-a-color' })).toThrow(/invalid flow local node type color/);
  });
});

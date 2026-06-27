import { describe, expect, it } from 'vitest';
import {
  FLOW_LOCAL_NODE_TYPES,
  flowLocalNodeTypeMeta,
  LEGACY_FLOW_LOCAL_NODE_TYPE_IDS,
  normalizeFlowLocalNodeType,
  resolveNewFlowLocalNodeType,
} from '../flowLocalNodeTypes.js';

describe('flowLocalNodeTypes', () => {
  it('normalizes legacy and unknown values to artifact', () => {
    expect(normalizeFlowLocalNodeType(undefined)).toBe('artifact');
    expect(normalizeFlowLocalNodeType('')).toBe('artifact');
    expect(normalizeFlowLocalNodeType('invalid')).toBe('artifact');
    expect(normalizeFlowLocalNodeType('agent')).toBe('artifact');
    expect(normalizeFlowLocalNodeType('human')).toBe('artifact');
    expect(normalizeFlowLocalNodeType('general')).toBe('artifact');
  });

  it('migrates retired step type to decision', () => {
    expect(normalizeFlowLocalNodeType('step')).toBe('decision');
    expect(LEGACY_FLOW_LOCAL_NODE_TYPE_IDS.has('step')).toBe(true);
  });

  it('preserves the current type ids', () => {
    for (const type of FLOW_LOCAL_NODE_TYPES) {
      expect(normalizeFlowLocalNodeType(type.id)).toBe(type.id);
    }
    expect(FLOW_LOCAL_NODE_TYPES.map((type) => type.id)).toEqual([
      'artifact',
      'action',
      'decision',
      'external_resource',
    ]);
  });

  it('tracks legacy ids for migration coverage', () => {
    expect(LEGACY_FLOW_LOCAL_NODE_TYPE_IDS.has('agent_skill')).toBe(true);
  });

  it('returns metadata with default titles', () => {
    expect(flowLocalNodeTypeMeta('step')).toMatchObject({
      id: 'decision',
      defaultTitle: 'Evaluation',
    });
    expect(flowLocalNodeTypeMeta('agent')).toMatchObject({
      id: 'artifact',
      defaultTitle: 'Artifact',
    });
  });

  it('defaults new steps to decision unless another current type is requested', () => {
    expect(resolveNewFlowLocalNodeType()).toBe('decision');
    expect(resolveNewFlowLocalNodeType('decision')).toBe('decision');
    expect(resolveNewFlowLocalNodeType('action')).toBe('action');
    expect(resolveNewFlowLocalNodeType('agent')).toBe('artifact');
    expect(resolveNewFlowLocalNodeType('step')).toBe('decision');
  });
});

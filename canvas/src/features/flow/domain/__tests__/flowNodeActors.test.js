import { describe, expect, it } from 'vitest';
import {
  FLOW_NODE_ACTORS,
  flowNodeActorMetas,
  normalizeFlowNodeActors,
  toggleFlowNodeActor,
} from '../flowNodeActors.js';

describe('flowNodeActors', () => {
  it('normalizes actor lists and removes duplicates', () => {
    expect(normalizeFlowNodeActors(undefined)).toEqual([]);
    expect(normalizeFlowNodeActors(['human', 'agent', 'human', 'invalid'])).toEqual(['human', 'agent']);
  });

  it('toggles actors on and off', () => {
    expect(toggleFlowNodeActor([], 'human')).toEqual(['human']);
    expect(toggleFlowNodeActor(['human', 'agent'], 'human')).toEqual(['agent']);
    expect(toggleFlowNodeActor(['human'], 'tool')).toEqual(['human', 'tool']);
  });

  it('returns actor metadata in stable order', () => {
    expect(flowNodeActorMetas(['tool', 'human']).map((entry) => entry.id)).toEqual(['human', 'tool']);
    expect(FLOW_NODE_ACTORS.map((entry) => entry.id)).toEqual(['human', 'agent', 'process', 'tool']);
  });
});

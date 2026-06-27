import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/primitivesApi.js', () => ({
  createRelationship: vi.fn(async () => ({})),
  addClusterMembers: vi.fn(async () => ({})),
}));

import { addClusterMembers, createRelationship } from '../../../../lib/primitivesApi.js';
import {
  AGENT_OUTPUT_RELATIONSHIP_TYPE,
  wireAgentOutputImages,
} from '../wireAgentOutputImages.js';

describe('wireAgentOutputImages', () => {
  beforeEach(() => {
    vi.mocked(createRelationship).mockClear();
    vi.mocked(addClusterMembers).mockClear();
  });

  it('creates created_by_agent wires from agent to each output image', async () => {
    await wireAgentOutputImages({
      clusterId: 'cluster-1',
      agentArtifactRef: { id: 'agent-1', type: 'artifact' },
      outputArtifactRefs: [
        { id: 'image-1', type: 'artifact' },
        { id: 'image-2', type: 'artifact' },
      ],
      executionId: 'exec-1',
    });

    expect(createRelationship).toHaveBeenCalledTimes(2);
    expect(addClusterMembers).toHaveBeenCalledWith('cluster-1', [
      { id: 'agent-1', type: 'artifact' },
      { id: 'image-1', type: 'artifact' },
      { id: 'image-2', type: 'artifact' },
    ]);
    expect(createRelationship).toHaveBeenNthCalledWith(
      1,
      'cluster-1',
      {
        from_ref: { id: 'agent-1', type: 'artifact' },
        to_ref: { id: 'image-1', type: 'artifact' },
        type: AGENT_OUTPUT_RELATIONSHIP_TYPE,
        provenance: [{ id: 'agent-1', type: 'artifact' }],
        metadata: { source: 'agent_execution', executionId: 'exec-1' },
      },
      { idempotent: true },
    );
  });

  it('skips when cluster or agent ref is missing', async () => {
    await wireAgentOutputImages({
      clusterId: null,
      agentArtifactRef: { id: 'agent-1', type: 'artifact' },
      outputArtifactRefs: [{ id: 'image-1', type: 'artifact' }],
    });
    expect(createRelationship).not.toHaveBeenCalled();
  });
});

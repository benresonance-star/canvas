import { createRelationship, addClusterMembers } from '../../../lib/primitivesApi.js';

export const AGENT_OUTPUT_RELATIONSHIP_TYPE = 'created_by_agent';

/**
 * Auto-wire agent artifact → each generated image (same as manual canvas drag).
 */
export async function wireAgentOutputImages({
  clusterId,
  agentArtifactRef,
  outputArtifactRefs = [],
  executionId = null,
}) {
  if (!clusterId || !agentArtifactRef?.id) return;
  const outputRefs = outputArtifactRefs.filter((ref) => ref?.id);
  for (const toRef of outputRefs) {
    await createRelationship(
      clusterId,
      {
        from_ref: agentArtifactRef,
        to_ref: toRef,
        type: AGENT_OUTPUT_RELATIONSHIP_TYPE,
        provenance: [agentArtifactRef],
        metadata: {
          source: 'agent_execution',
          ...(executionId ? { executionId } : {}),
        },
      },
      { idempotent: true },
    );
  }
  if (outputRefs.length) {
    await addClusterMembers(clusterId, [agentArtifactRef, ...outputRefs]);
  }
}

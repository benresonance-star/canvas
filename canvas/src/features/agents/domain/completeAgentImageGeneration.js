import { ensureClusterForProject } from '../../../lib/primitivesApi.js';
import {
  mergeFolderPresentKeys,
  persistGeneratedImageOutputs,
} from './saveGeneratedImageToFolder.js';
import { wireAgentOutputImages } from './wireAgentOutputImages.js';

/**
 * Persist generated outputs to folder, place cards, wire agent→image links, refresh graph.
 */
export async function completeAgentImageGeneration({
  folderHandle = null,
  folderPresentKeys = null,
  setFolderPresentKeys = null,
  outputs = [],
  positions = [],
  executionId = null,
  agentArtifactRef,
  clusterId = null,
  projectId = null,
  projectName = null,
  appendGeneratedCards,
  refreshGraph,
}) {
  const { cards, writtenKeys, folderWriteOk } = await persistGeneratedImageOutputs({
    folderHandle,
    projectId,
    outputs,
    positions,
    executionId,
  });

  if (writtenKeys.length > 0 && setFolderPresentKeys) {
    setFolderPresentKeys(mergeFolderPresentKeys(folderPresentKeys, writtenKeys));
  }

  await appendGeneratedCards?.(cards);

  let effectiveClusterId = clusterId;
  if (!effectiveClusterId && projectId) {
    const { cluster } = await ensureClusterForProject(projectId, projectName || 'Project');
    effectiveClusterId = cluster?.id ?? null;
  }

  if (effectiveClusterId && agentArtifactRef?.id) {
    await wireAgentOutputImages({
      clusterId: effectiveClusterId,
      agentArtifactRef,
      outputArtifactRefs: cards
        .map((card) => card.versions?.[0]?.artifactRef)
        .filter((ref) => ref?.id),
      executionId,
    });
  }

  await refreshGraph?.({
    clusterId: effectiveClusterId,
    projectId,
    force: true,
  });

  return { cards, folderWriteOk, writtenKeys };
}

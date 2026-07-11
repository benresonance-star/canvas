import { ensureCardArtifactRef } from '../ensureCardArtifactRef.js';
import { ensureClusterForProject } from '../primitivesApi.js';
import { processArtifactSyncRetryEntry } from '../artifactSyncRetry.js';
import { flushArtifactSyncOutbox } from '../artifactSyncOutbox.js';
import { createLinksFromSource } from './linkIngest.js';

/**
 * Ensure a newly created card has a primitives artifact ref and optional UI links.
 * @param {{
 *   projectId: string,
 *   projectName?: string,
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   card: object,
 *   linkTargetRefs?: object[],
 *   clusterId?: string | null,
 *   artifactRef?: object | null,
 * }} params
 */
export async function finalizeArtifactLinks({
  projectId,
  projectName,
  folderHandle,
  card,
  linkTargetRefs = [],
  clusterId = null,
  artifactRef = null,
}) {
  let sourceRef = artifactRef?.id ? artifactRef : null;
  let versionPatch = null;

  if (!sourceRef?.id) {
    await flushArtifactSyncOutbox(async (entry) => {
      if (entry.projectId !== projectId || entry.cardKey !== card.key) {
        return { ok: false };
      }
      return processArtifactSyncRetryEntry(entry);
    }, { projectId });

    const ensured = await ensureCardArtifactRef({
      projectId,
      projectName,
      folderHandle,
      card,
    });
    if (!ensured.ok) {
      return { ok: false, reason: ensured.reason };
    }
    sourceRef = ensured.artifactRef;
    versionPatch = ensured.version;
  }

  if (!linkTargetRefs.length) {
    return {
      ok: true,
      linked: 0,
      artifactRef: sourceRef,
      versionPatch,
      clusterId,
    };
  }

  let effectiveClusterId = clusterId;
  if (!effectiveClusterId) {
    const { cluster } = await ensureClusterForProject(projectId, projectName || 'Project');
    effectiveClusterId = cluster?.id ?? null;
  }
  if (!effectiveClusterId) {
    return { ok: false, reason: 'no_cluster', artifactRef: sourceRef, versionPatch };
  }

  const linked = await createLinksFromSource(
    effectiveClusterId,
    sourceRef,
    linkTargetRefs,
  );

  return {
    ok: true,
    linked,
    artifactRef: sourceRef,
    versionPatch,
    clusterId: effectiveClusterId,
  };
}

import {
  loadFolderHandle,
  saveFolderHandle,
  removeFolderHandle,
} from './folderStore.js';
import { normalizeProjectNameKey } from './projectIndexNormalize.js';

/**
 * When duplicate projects are merged, folder handles may remain keyed by dropped ids.
 * Move handles onto kept project rows when the kept row has none.
 *
 * @param {object | null | undefined} indexBefore
 * @param {object | null | undefined} normalizedIndex
 * @param {string[]} removedIds
 */
export async function migrateFolderHandlesOnIndexRepair(
  indexBefore,
  normalizedIndex,
  removedIds,
) {
  if (!removedIds?.length || !normalizedIndex?.projects?.length) return;

  const droppedById = new Map(
    (indexBefore?.projects ?? []).filter((p) => p?.id).map((p) => [p.id, p]),
  );
  const keptProjects = normalizedIndex.projects ?? [];

  for (const removedId of removedIds) {
    const handle = await loadFolderHandle(removedId);
    if (!handle) continue;

    const dropped = droppedById.get(removedId);
    const nameKey = dropped
      ? normalizeProjectNameKey(dropped.name)
      : normalizeProjectNameKey(handle.name);

    const kept = keptProjects.find(
      (p) => p.id !== removedId && normalizeProjectNameKey(p.name) === nameKey,
    );
    if (!kept?.id) continue;

    const existingOnKept = await loadFolderHandle(kept.id);
    if (!existingOnKept) {
      await saveFolderHandle(kept.id, handle);
    }
    await removeFolderHandle(removedId);
  }
}

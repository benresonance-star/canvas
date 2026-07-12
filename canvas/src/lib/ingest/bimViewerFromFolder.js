import { getCardPixelSize } from '../cards.js';
import { folderRelativePathFromVersion } from '../filename.js';
import { getPreview } from '../previewStore.js';
import { getFileHandleAtPath } from '../folderWrite.js';
import { artifactDateFieldsFromVersion } from '../artifactDates.js';
import { normalizeBimWorkspaceSession } from '../../features/bim/bim-core/types.js';

export function bimSourceStorageKey(sourceFileHash) {
  return `bim-source:${sourceFileHash}`;
}

function pinnedVersionForStaged(staged) {
  return (staged?.versions ?? []).find((v) => v.version === staged.pinnedVersion)
    ?? staged?.versions?.[0]
    ?? null;
}

export function isFolderIfcStagedEntry(staged) {
  if (!staged || staged.type !== 'bim-model') return false;
  const pinned = pinnedVersionForStaged(staged);
  return pinned?.bim?.viewerKind !== 'ifc-viewer-session';
}

export function isBimViewerSessionCanvasCard(card) {
  const pinned = (card?.versions ?? []).find((v) => v.version === card.pinnedVersion)
    ?? card?.versions?.[0]
    ?? null;
  return pinned?.bim?.viewerKind === 'ifc-viewer-session' || card?.prefix === 'bim-viewers';
}

/**
 * Build a federated IFC viewer session card from a folder-sync dock entry.
 */
export function createBimViewerCardFromFolderStaged(staged, worldX, worldY) {
  const pinned = pinnedVersionForStaged(staged);
  const contentHash = String(pinned?.content_hash ?? '').trim();
  const relativePath = staged.relativePath
    ?? folderRelativePathFromVersion(pinned)
    ?? null;
  const filename = pinned?.filename ?? `${staged.name ?? 'IFC model'}.ifc`;
  const displayName = staged.name ?? pinned?.name ?? 'IFC model';
  const modelId = contentHash
    ? `bim-model:${contentHash.slice(0, 16)}`
    : `bim-model:${crypto.randomUUID().slice(0, 16)}`;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const folderSyncKey = staged.key ?? null;
  const session = normalizeBimWorkspaceSession({
    id: `bim-session:${id}`,
    modelRefs: [{
      modelId,
      sourceName: filename,
      label: displayName,
      sourceFileHash: contentHash,
      sourceStorageKey: '',
      sourceKind: 'linkedFolder',
      sourcePath: relativePath,
      sourceLastModified: Number.isFinite(pinned?.lastModified) ? pinned.lastModified : null,
      sourceSize: Number.isFinite(pinned?.size) ? pinned.size : null,
      sourceStatus: 'unknown',
      fingerprint: '',
      preparedModelKey: '',
      status: 'importing',
      role: '',
      importedAt: now,
      updatedAt: now,
    }],
    activeModelId: modelId,
    visibilityByModelId: { [modelId]: true },
    queryScope: 'active',
    createdAt: now,
    updatedAt: now,
  });
  const { w, h } = getCardPixelSize({ type: 'bim-model' });
  return {
    id,
    key: `bim-viewers__${id}`,
    folderSyncKey,
    ...(relativePath ? { relativePath, folderPath: relativePath } : {}),
    prefix: 'bim-viewers',
    name: displayName,
    type: 'bim-model',
    versions: [{
      version: 1,
      inline: true,
      ext: 'ifc-viewer',
      filename: `${displayName}.ifc-viewer.json`,
      createdAt: now,
      content_hash: contentHash || null,
      bim: {
        viewerKind: 'ifc-viewer-session',
        session,
      },
    }],
    pinnedVersion: 1,
    ...artifactDateFieldsFromVersion(pinned),
    x: worldX - w / 2,
    y: worldY - h / 2,
  };
}

/**
 * Cache a scanned IFC blob into BIM modelSources for session restore.
 * @returns {Promise<{ sourceStorageKey: string | null, cached: boolean }>}
 */
export async function cacheFolderIfcToModelSources(version, repository, { folderHandle = null } = {}) {
  const contentHash = String(version?.content_hash ?? '').trim();
  if (!contentHash || !repository?.putModelSource) {
    return { sourceStorageKey: null, cached: false };
  }
  const sourceStorageKey = bimSourceStorageKey(contentHash);
  const relativePath = version.relativePath ?? folderRelativePathFromVersion(version);
  let blob = null;
  if (version.previewCacheKey) {
    blob = await getPreview(version.previewCacheKey);
  }
  if (!blob && version.objectUrl) {
    try {
      const response = await fetch(version.objectUrl);
      if (response.ok) blob = await response.blob();
    } catch {
      // Fall through — try linked folder below.
    }
  }
  if (!blob && folderHandle && relativePath) {
    try {
      const handle = await getFileHandleAtPath(folderHandle, relativePath);
      const file = await handle.getFile();
      blob = new Blob([await file.arrayBuffer()], {
        type: file.type || 'application/x-step',
      });
    } catch {
      // Fall through — linkedFolder load on workspace open.
    }
  }
  if (!blob) {
    return { sourceStorageKey: null, cached: false };
  }
  await repository.putModelSource(sourceStorageKey, {
    blob,
    metadata: {
      sourceName: version.filename ?? version.name ?? 'model.ifc',
      sourceFileHash: contentHash,
      sourceKind: 'linkedFolder',
      sourcePath: relativePath ?? null,
      sourceLastModified: Number.isFinite(version.lastModified) ? version.lastModified : null,
      sourceSize: version.size ?? blob.size,
      cachedAt: new Date().toISOString(),
    },
  });
  return { sourceStorageKey, cached: true };
}

export function applySourceStorageKeyToCard(card, sourceStorageKey) {
  if (!sourceStorageKey || !card?.versions?.length) return card;
  const pinnedVer = card.pinnedVersion ?? card.versions[0]?.version;
  return {
    ...card,
    versions: card.versions.map((version) => {
      if (version.version !== pinnedVer) return version;
      const session = version.bim?.session;
      if (!session?.modelRefs?.length) return version;
      return {
        ...version,
        bim: {
          ...version.bim,
          session: normalizeBimWorkspaceSession({
            ...session,
            modelRefs: session.modelRefs.map((ref, index) => (
              index === 0 ? { ...ref, sourceStorageKey } : ref
            )),
          }),
        },
      };
    }),
  };
}

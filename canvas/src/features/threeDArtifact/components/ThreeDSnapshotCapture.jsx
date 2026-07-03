import { useEffect, useRef } from 'react';
import { folderBackedSyncKeyForEntry } from '../../../lib/filename.js';
import { deletePreview, putPreview } from '../../../lib/previewStore.js';
import { canAutoLoadThreeDSource, assessThreeDPreviewFeasibility } from '../utils/previewFeasibility.js';
import { resolveThreeDSourceUrl } from '../hooks/useThreeDModelSource.js';
import { detectThreeDFormat } from '../utils/fileFormat.js';
import { captureThreeDSnapshotBlob } from '../loaders/captureThreeDSnapshot.js';
import {
  threeDSnapshotCacheKey,
  threeDSnapshotNeedsCapture,
} from '../utils/snapshotCache.js';
import { normalizeThreeDViewerState } from '../utils/viewerState.js';
import { resolveEnvironmentPreset } from '../utils/environmentConfig.js';

function applyCardUpdate(onUpdateCard, cardId, updates) {
  if (!onUpdateCard || !cardId) return;
  if (onUpdateCard.length >= 2) {
    onUpdateCard(cardId, updates);
  } else {
    onUpdateCard(updates);
  }
}

/**
 * Invisible worker: captures a centered PNG snapshot once per model version / content hash.
 */
export function ThreeDSnapshotCapture({
  card,
  version,
  projectId,
  folderHandle = null,
  onUpdateCard = null,
}) {
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!card?.id || !version || !projectId || !onUpdateCard) return undefined;
    if (inFlightRef.current) return undefined;

    const viewerState = normalizeThreeDViewerState(
      card?.threeDViewerState ?? version?.threeD?.viewerState,
    );
    const environmentPreset = resolveEnvironmentPreset(viewerState);
    if (!threeDSnapshotNeedsCapture(version, environmentPreset)) return undefined;

    const filename = version.filename ?? version.relativePath ?? '';
    const format = String(version.ext || detectThreeDFormat(filename) || '').toLowerCase();
    const feasibility = assessThreeDPreviewFeasibility(version, {
      folderLinked: Boolean(folderHandle),
    });
    if (!canAutoLoadThreeDSource(feasibility.mode)) return undefined;

    let cancelled = false;
    inFlightRef.current = true;

    async function capture() {
      const cardKey = folderBackedSyncKeyForEntry(card);
      const cacheKey = threeDSnapshotCacheKey(
        projectId,
        cardKey,
        version.version,
        environmentPreset,
      );
      if (!cacheKey) return;

      let ephemeralUrls = [];
      try {
        const resolved = await resolveThreeDSourceUrl({
          version,
          folderHandle,
          format,
          loadFromFolder: false,
        });
        ephemeralUrls = resolved.ephemeralUrls;
        if (!resolved.sourceUrl || cancelled) return;

        if (version.threeDSnapshotCacheKey && version.threeDSnapshotCacheKey !== cacheKey) {
          await deletePreview(version.threeDSnapshotCacheKey);
        }

        const blob = await captureThreeDSnapshotBlob({
          sourceUrl: resolved.sourceUrl,
          format,
          viewerState,
        });
        if (cancelled) return;

        await putPreview(cacheKey, blob);
        applyCardUpdate(onUpdateCard, card.id, {
          versions: (card.versions ?? []).map((candidate) =>
            candidate.version === version.version
              ? {
                  ...candidate,
                  threeDSnapshotCacheKey: cacheKey,
                  threeDSnapshotContentHash: candidate.content_hash ?? version.content_hash,
                  threeDSnapshotEnvironmentPreset: environmentPreset,
                }
              : candidate,
          ),
        });
      } catch (error) {
        console.warn('3D snapshot capture failed:', error);
      } finally {
        ephemeralUrls.forEach((url) => URL.revokeObjectURL(url));
        inFlightRef.current = false;
      }
    }

    void capture();

    return () => {
      cancelled = true;
    };
  }, [
    card?.threeDViewerState,
    card?.id,
    card?.key,
    card?.versions,
    folderHandle,
    onUpdateCard,
    projectId,
    version,
    version?.content_hash,
    version?.previewCacheKey,
    version?.objectUrl,
    version?.relativePath,
    version?.threeD?.viewerState,
    version?.threeDSnapshotCacheKey,
    version?.threeDSnapshotContentHash,
    version?.threeDSnapshotEnvironmentPreset,
    version?.version,
  ]);

  return null;
}

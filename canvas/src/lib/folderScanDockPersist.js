import { canonicalKeyForEntry } from './artifactPlacement.js';

/**
 * True when live dock rows are not yet reflected in the committed project payload.
 * @param {object[] | null | undefined} liveStaged
 * @param {object | null | undefined} committedPayload
 */
export function dockPersistAheadOfCommit(liveStaged, committedPayload) {
  const live = liveStaged ?? [];
  const committed = committedPayload?.stagedSyncCards ?? [];
  if (live.length > committed.length) return true;
  if (live.length === 0) return false;

  const committedKeySet = new Set(
    committed.map((row) => canonicalKeyForEntry(row)).filter(Boolean),
  );
  const committedIdSet = new Set(
    committed.map((row) => row.stagingId).filter(Boolean),
  );

  return live.some((row) => {
    const key = canonicalKeyForEntry(row);
    const id = row.stagingId;
    if (id && committedIdSet.has(id)) return false;
    if (key && committedKeySet.has(key)) return false;
    return true;
  });
}

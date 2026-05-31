import { resolveLoadedCardType } from './filename.js';
import {
  stripVersionForPersist,
  slimProjectPayloadForCache,
} from './projectSlim.js';
import {
  initializeProjectSync,
  loadSyncedProjectDocument,
  loadSyncedProjectIndex,
  persistProjectDocumentLocally,
  flushOutgoingProjectDocument,
} from './projectSync.js';
import { suppressedKeysForSave } from './syncSuppressedKeys.js';
import {
  attachArtifactPlacementsToPayload,
  reconcileArtifactPlacements,
} from './artifactPlacementsMap.js';
import {
  migrateFolderBackedCardKeys,
  migrateFolderBackedStagedKeys,
} from './canvasCardMerge.js';
import {
  reconcileSpecCanvasOnLoad,
  syncSpecCanvasStateFromPayload,
} from './specDataPlaneSync.js';

export async function loadProjectById(projectId, { localOnly = false } = {}) {
  if (!projectId) return null;
  try {
    await initializeProjectSync();
    const doc = await loadSyncedProjectDocument(projectId, { localOnly });
    if (!doc) return null;
    return reconcileSpecCanvasOnLoad(projectId, doc);
  } catch {
    return null;
  }
}

export { stripVersionForPersist } from './projectSlim.js';

function normalizeLoadedVersions(versions) {
  return (versions ?? []).map((v) => {
    let row = v;
    if (row.previewStripped && (row.dataUrl || row.previewCacheKey)) {
      row = { ...row, previewStripped: false };
    }
    const hasMedia = Boolean(row.dataUrl || row.objectUrl);
    const hasText = row.content != null && row.content !== '';
    if (row.inline && !hasMedia && !hasText && !row.previewCacheKey) {
      return { ...row, inline: false };
    }
    return row;
  });
}

/** Fix legacy rows where inline stayed true after dataUrl/objectUrl was cleared */
export function normalizeLoadedProject(data) {
  if (!data) return data;
  const next = { ...data };
  const rawCards = Array.isArray(data.cards) ? data.cards : [];
  next.cards = rawCards.map((c) => ({
    ...c,
    type: resolveLoadedCardType(c),
    versions: normalizeLoadedVersions(c.versions),
  }));
  const rawStaged = Array.isArray(data.stagedSyncCards) ? data.stagedSyncCards : [];
  next.stagedSyncCards = rawStaged.map((s) => ({
    ...s,
    type: resolveLoadedCardType(s),
    versions: normalizeLoadedVersions(s.versions),
  }));
  const migratedCards = migrateFolderBackedCardKeys(next.cards);
  const migratedStaged = migrateFolderBackedStagedKeys(next.stagedSyncCards);
  next.cards = migratedCards.cards;
  next.stagedSyncCards = migratedStaged.stagedSyncCards;
  return reconcileArtifactPlacements(next);
}

export function sanitizeStagedForPersist(stagedCards, opts = {}) {
  return (stagedCards ?? []).map((s) => ({
    ...s,
    versions: (s.versions ?? []).map((v) => stripVersionForPersist(v, opts)),
  }));
}

export function stateForPersist(state, opts = {}) {
  const { stagedSyncCards: _staged, ...rest } = state;
  return {
    ...rest,
    cards: (state.cards ?? []).map((c) => ({
      ...c,
      versions: (c.versions ?? []).map((v) => stripVersionForPersist(v, opts)),
    })),
  };
}

export function buildProjectSavePayload(
  state,
  stagedSyncCards = [],
  suppressedSyncKeys = [],
  { stripNoteContent = false } = {},
) {
  const keys = Array.isArray(suppressedSyncKeys)
    ? suppressedSyncKeys.filter((k) => typeof k === 'string' && k)
    : [];
  const stripOpts = { stripNoteContent };
  const base = {
    ...stateForPersist(state, stripOpts),
    stagedSyncCards: sanitizeStagedForPersist(stagedSyncCards, stripOpts),
    suppressedSyncKeys: keys,
  };
  return attachArtifactPlacementsToPayload(base, base.stagedSyncCards);
}

/**
 * Persist project document to local cache and optionally Postgres.
 *
 * - Default: local cache only (`pushRemote: false`). Layout/card edits should use
 *   `requestActionSync` instead of relying on this for server push.
 * - `pushRemote: true`: always attempt `flushOutgoingProjectDocument` (even when
 *   local cache write fails) — use for create, rename, migrate, and hygiene saves.
 * - `persistLocal: true`: legacy alias; local cache is always written when possible.
 *
 * @returns {{ trimmed?: boolean, localCacheWritten?: boolean, pushOk?: boolean, error?: Error }}
 */
export async function saveProjectById(
  projectId,
  state,
  stagedSyncCards = [],
  {
    persistLocal = false,
    pushRemote = false,
    stripNoteContent = false,
  } = {},
) {
  if (!projectId) return { error: new Error('No project id') };
  try {
    let payloadState = state;
    try {
      const index = await loadSyncedProjectIndex();
      const row = index?.projects?.find((p) => p.id === projectId);
      if (row?.name && row.name !== state.projectName) {
        payloadState = { ...state, projectName: row.name };
      }
    } catch {
      /* use state as-is */
    }
    const payload = buildProjectSavePayload(
      payloadState,
      stagedSyncCards,
      suppressedKeysForSave(projectId, payloadState),
      { stripNoteContent },
    );
    const { serialised, trimmed } = slimProjectPayloadForCache(payload, {
      stripNoteContent,
    });
    const localCacheWritten = await persistProjectDocumentLocally(
      projectId,
      serialised,
    );
    let pushOk;
    if (pushRemote) {
      const pushResult = await flushOutgoingProjectDocument(projectId, payload);
      pushOk = Boolean(pushResult?.ok);
      void syncSpecCanvasStateFromPayload(projectId, payload);
    } else if (!persistLocal) {
      void syncSpecCanvasStateFromPayload(projectId, payload);
    }
    return { trimmed, localCacheWritten, pushOk };
  } catch (e) {
    console.error('Save failed:', e);
    return { error: e };
  }
}
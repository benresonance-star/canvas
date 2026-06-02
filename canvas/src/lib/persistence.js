/**
 * Phase 4 load authority: prefer {@link loadProjectStructure} and {@link applyProjectLoadFence}
 * for all UI/feature loads. `loadProjectById` is a deprecated alias.
 */
import { resolveLoadedCardType } from './filename.js';
import {
  stripVersionForPersist,
  slimProjectPayloadForCache,
} from './projectSlim.js';
import {
  commitProjectDocument,
  getCommittedPayload,
  clearCommittedPayloadCache,
  seedCommittedPayloadFromLoad,
} from './projectDocumentCommit.js';
import {
  migrateFolderBackedCardKeys,
  migrateFolderBackedStagedKeys,
} from './canvasCardMerge.js';
import {
  attachArtifactPlacementsToPayload,
  buildPayloadFromAuthoritativePlacements,
  patchPlacementsMapFromArrays,
  reconcileArtifactPlacements,
} from './artifactPlacementsMap.js';
import { suppressedKeysForSave } from './syncSuppressedKeys.js';
import { auditPlacementStep } from './placementAudit.js';
import { loadProjectStructure } from './project/loadProjectStructure.js';

/**
 * @deprecated Use {@link loadProjectStructure} from `./project/loadProjectStructure.js`.
 */
export async function loadProjectById(projectId, options = {}) {
  return loadProjectStructure(projectId, options);
}

export { loadProjectStructure, loadProjectDocument, applyProjectLoadFence } from './project/loadProjectStructure.js';

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
  next.artifactPlacements = patchPlacementsMapFromArrays(
    next.artifactPlacements ?? {},
    next.cards,
    next.stagedSyncCards,
  );
  const reconciled = reconcileArtifactPlacements(next);
  auditPlacementStep('load:normalize', reconciled);
  return reconciled;
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
  { stripNoteContent = false, authoritativePlacements = null } = {},
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
  if (
    authoritativePlacements
    && typeof authoritativePlacements === 'object'
    && Object.keys(authoritativePlacements).length > 0
  ) {
    const synced = buildPayloadFromAuthoritativePlacements(
      base.cards ?? [],
      base.stagedSyncCards ?? [],
      authoritativePlacements,
    );
    return {
      ...base,
      cards: synced.cards,
      stagedSyncCards: synced.stagedSyncCards,
      artifactPlacements: synced.artifactPlacements,
      artifactPlacementsVersion: synced.artifactPlacementsVersion,
    };
  }
  return attachArtifactPlacementsToPayload(base, base.stagedSyncCards);
}

export {
  commitProjectDocument,
  getCommittedPayload,
  clearCommittedPayloadCache,
  seedCommittedPayloadFromLoad,
};

/**
 * Persist project document to local cache and optionally Postgres.
 *
 * @deprecated For layout/placement edits prefer {@link commitProjectDocument} or
 *   `requestActionSync`. Retained for index/hygiene/create flows.
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
    const commitResult = await commitProjectDocument(projectId, {
      state,
      stagedSyncCards,
      suppressedSyncKeys: suppressedKeysForSave(projectId, state),
      stripNoteContent,
      reason: 'saveProjectById',
      pushRemote,
    });
    const payload = commitResult.payload;
    const { trimmed } = slimProjectPayloadForCache(payload ?? {}, {
      stripNoteContent,
    });
    return {
      trimmed,
      localCacheWritten: commitResult.localCacheWritten,
      pushOk: commitResult.pushOk,
    };
  } catch (e) {
    console.error('Save failed:', e);
    return { error: e };
  }
}
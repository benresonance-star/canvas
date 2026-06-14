import {
  ARTIFACT_PLACEMENTS_VERSION,
  patchPlacementsMapFromArrays,
} from './artifactPlacementsMap.js';
import { buildProjectSavePayload } from './persistence.js';
import { resolveProjectDisplayName } from './projectDisplayName.js';
import { slimProjectPayloadForCache } from './projectSlim.js';
import { projectArtifactCount } from './projectDocumentShape.js';
import { projectCardCount } from './sync/projectSyncMerge.js';
import {
  cancelPendingProjectSave,
  flushOutgoingProjectDocument,
  persistProjectDocumentLocally,
} from './projectSync.js';
import { readLocalProjectSerialised } from './sync/projectSyncLocal.js';
import { auditPlacementStep } from './placementAudit.js';
import { writeThroughSpecCanvasFromPayload } from './structure/canvasWriteThrough.js';
import { syncTraceLog } from './sync/syncTrace.js';

/** @type {Map<string, { payload: object, serialised: string }>} */
const committedPayloadByProject = new Map();

/** Pre-commit snapshot for PATCH op generation (placement transfer). */
/** @type {Map<string, object>} */
const priorPayloadForPatchByProject = new Map();

/**
 * @param {string} projectId
 */
async function readLocalPayload(projectId) {
  try {
    const raw = await readLocalProjectSerialised(projectId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} projectId
 */
export function getCommittedPayload(projectId) {
  return committedPayloadByProject.get(projectId)?.payload ?? null;
}

/**
 * Document as committed before the latest `commitProjectDocument` (for PATCH diffs).
 * @param {string} projectId
 */
export function getPriorPayloadForPatch(projectId) {
  return priorPayloadForPatchByProject.get(projectId) ?? null;
}

/**
 * After hydrating a project into UI, align the commit cache so the next push
 * can diff against what was loaded (not an empty prior).
 * @param {string} projectId
 * @param {object} payload
 */
export function seedCommittedPayloadFromLoad(projectId, payload) {
  if (!projectId || !payload) return;
  committedPayloadByProject.set(projectId, {
    payload,
    serialised: JSON.stringify(payload),
  });
  priorPayloadForPatchByProject.delete(projectId);
}

/**
 * @param {string} [projectId]
 */
export function clearCommittedPayloadCache(projectId) {
  if (projectId) {
    committedPayloadByProject.delete(projectId);
    priorPayloadForPatchByProject.delete(projectId);
    return;
  }
  committedPayloadByProject.clear();
  priorPayloadForPatchByProject.clear();
}

/**
 * Single write path: build payload (map-authoritative when placements provided), persist IDB+LS.
 * @param {string} projectId
 * @param {{
 *   state: object,
 *   stagedSyncCards: object[],
 *   artifactPlacements?: Record<string, object> | null,
 *   suppressedSyncKeys?: string[],
 *   stripNoteContent?: boolean,
 *   reason?: string,
 *   pushRemote?: boolean,
 *   traceId?: string | null,
 * }} options
 */
export async function commitProjectDocument(projectId, options) {
  const {
    state,
    stagedSyncCards,
    artifactPlacements = null,
    suppressedSyncKeys = [],
    stripNoteContent = false,
    reason = 'commit',
    pushRemote = false,
    traceId = null,
  } = options;

  if (!projectId || !state) {
    return { ok: false, error: new Error('No project id or state') };
  }

  syncTraceLog(traceId, 'commit:start', {
    projectId,
    reason,
    cardCount: (state.cards ?? []).length,
    stagedCount: (stagedSyncCards ?? []).length,
  });

  cancelPendingProjectSave(projectId);

  const stagedForPatch = Array.isArray(stagedSyncCards)
    ? stagedSyncCards
    : ((await readLocalPayload(projectId))?.stagedSyncCards ?? []);

  let authoritativePlacements = artifactPlacements;
  if (
    !authoritativePlacements
    || typeof authoritativePlacements !== 'object'
    || Object.keys(authoritativePlacements).length === 0
  ) {
    const local = await readLocalPayload(projectId);
    if (local?.artifactPlacements && Object.keys(local.artifactPlacements).length > 0) {
      authoritativePlacements = patchPlacementsMapFromArrays(
        local.artifactPlacements,
        state.cards ?? [],
        stagedForPatch,
      );
    }
  }

  authoritativePlacements = patchPlacementsMapFromArrays(
    authoritativePlacements ?? {},
    state.cards ?? [],
    stagedForPatch,
  );

  let displayName = state.projectName;
  try {
    const { loadProjectIndex } = await import('./projects.js');
    const index = await loadProjectIndex();
    displayName = resolveProjectDisplayName(index, projectId);
  } catch {
    /* index unavailable — keep state title for offline */
  }

  const builtPayload = buildProjectSavePayload(
    { ...state, projectName: displayName },
    stagedForPatch,
    suppressedSyncKeys,
    {
      stripNoteContent,
      authoritativePlacements,
    },
  );
  const { payload, serialised } = slimProjectPayloadForCache(builtPayload, {
    stripNoteContent,
  });

  auditPlacementStep(`commit:${reason}`, payload, { projectId });

  const localCacheWritten = await persistProjectDocumentLocally(projectId, serialised, {
    stripNoteContent,
  });

  auditPlacementStep(`commit:${reason}:after-persist`, await readLocalPayload(projectId), {
    projectId,
  });

  const priorPayload = committedPayloadByProject.get(projectId)?.payload ?? null;
  if (priorPayload) {
    priorPayloadForPatchByProject.set(projectId, priorPayload);
  } else {
    priorPayloadForPatchByProject.delete(projectId);
  }

  committedPayloadByProject.set(projectId, { payload, serialised });

  syncTraceLog(traceId, 'commit:cached', {
    projectId,
    localCacheWritten,
    placementKeys: Object.keys(payload.artifactPlacements ?? {}).length,
  });

  void writeThroughSpecCanvasFromPayload(projectId, payload, reason);

  let pushOk;
  if (pushRemote) {
    const previousCardCount = projectCardCount(priorPayload);
    const nextCardCount = projectCardCount(payload);
    const previousArtifactCount = projectArtifactCount(priorPayload);
    const nextArtifactCount = projectArtifactCount(payload);
    const pushResult = await flushOutgoingProjectDocument(projectId, payload, {
      reason,
      traceId,
      beforePayload: priorPayload,
      allowEmptyRemoteOverwrite:
        nextArtifactCount === 0
        && previousArtifactCount > 0
        && reason !== 'boot-push',
      allowDockOnlyRemoteOverwrite:
        nextCardCount === 0
        && nextArtifactCount > 0
        && previousCardCount > 0
        && reason === 'placementTransfer:dock',
      skipSpecDualWrite: true,
    });
    pushOk = Boolean(pushResult?.ok);
  }

  syncTraceLog(traceId, 'commit:done', { projectId, pushRemote, pushOk });

  return { ok: localCacheWritten, localCacheWritten, payload, serialised, pushOk };
}

/** @internal */
export function setCommittedPayloadForTests(projectId, payload) {
  committedPayloadByProject.set(projectId, {
    payload,
    serialised: JSON.stringify(payload),
  });
}

/** @internal */
export function resetProjectDocumentCommitForTests() {
  committedPayloadByProject.clear();
  priorPayloadForPatchByProject.clear();
}

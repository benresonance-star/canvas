import {
  deleteProjectDocumentSerialised,
  migrateLocalStorageProjectsToIdb,
} from '../projectDocumentStore.js';
import { projectStorageKey } from '../constants.js';
import { projectRevisionStorageKey } from '../projectRevision.js';
import {
  fetchCanvasIndexDocument,
  saveCanvasIndex,
  saveCanvasProject,
} from '../canvasProjectsApi.js';
import {
  getQuickInitDone,
  setQuickInitDone,
  getServerSyncEnabled,
  setServerSyncEnabled,
  getPendingBackgroundMode,
  setPendingBackgroundMode,
  getPendingSyncBothLocalOnlyIds,
  setPendingSyncBothLocalOnlyIds,
  getPendingSyncBothServerOnlyIds,
  setPendingSyncBothServerOnlyIds,
  getPendingColdBrowserHint,
  setPendingColdBrowserHint,
  setPendingDatabaseUnavailable,
  setLastSyncRecoveryCount,
  bumpLastSyncRecoveryCount,
  getQuickInitPromise,
  setQuickInitPromise,
  getBackgroundSyncPromise,
  setBackgroundSyncPromise,
} from './projectSyncState.js';
import { parseServerUpdatedAt, mergeProjectIndices } from './projectSyncMerge.js';
import { readLocalIndex, writeLocalIndex, readLocalProjectSerialised } from './projectSyncLocal.js';
import { applyServerProjectRevision } from './projectSyncRevision.js';
import {
  patchIndexDocumentRevision,
  setLastServerWorkspaceIndexUpdatedAt,
} from './projectSyncIndex.js';
import { pullProjectDocumentIfServerNewer } from './projectSyncDocument.js';
import { projectCardCount } from './projectSyncMerge.js';

async function runQuickInitBody() {
  try {
    await migrateLocalStorageProjectsToIdb();
  } catch (e) {
    console.warn('Project cache IDB migration skipped:', e?.message ?? e);
  }

  const { fetchHealth } = await import('../primitivesApi.js');
  const health = await fetchHealth();
  if (!health.apiReachable) {
    setServerSyncEnabled(false);
    setPendingBackgroundMode('none');
    setPendingDatabaseUnavailable(false);
    return { mode: 'local-only', serverSyncEnabled: false, apiAvailable: false };
  }
  if (!health.ok) {
    setServerSyncEnabled(false);
    setPendingBackgroundMode('none');
    setPendingDatabaseUnavailable(true);
    return {
      mode: 'local-only',
      serverSyncEnabled: false,
      apiAvailable: true,
      databaseUnavailable: true,
    };
  }
  setPendingDatabaseUnavailable(false);

  let serverIndex = null;
  let serverIndexRevision = 0;
  try {
    const remote = await fetchCanvasIndexDocument();
    serverIndex = remote.index;
    serverIndexRevision = Number(remote.revision) || 0;
    const initServerMs = parseServerUpdatedAt(remote.updatedAt);
    if (initServerMs > 0) {
      setLastServerWorkspaceIndexUpdatedAt(initServerMs);
    }
  } catch (e) {
    console.warn('Canvas API unavailable for project sync:', e.message);
    setServerSyncEnabled(false);
    setPendingBackgroundMode('none');
    return { mode: 'local-only', serverSyncEnabled: false, apiAvailable: true };
  }

  const localIndex = await readLocalIndex();
  const serverHasProjects = Boolean(serverIndex?.projects?.length);
  const localHasProjects = Boolean(localIndex?.projects?.length);
  const serverHasExplicitEmptyIndex =
    Boolean(serverIndex)
    && Array.isArray(serverIndex.projects)
    && serverIndex.projects.length === 0
    && serverIndexRevision > 0;

  setPendingColdBrowserHint(!localHasProjects && !serverHasProjects);

  if (serverHasProjects && localHasProjects) {
    const { index, merged, localOnlyIds, serverOnlyIds } = mergeProjectIndices(
      localIndex,
      serverIndex,
    );
    await writeLocalIndex(index);
    setServerSyncEnabled(true);
    if (merged) {
      setPendingBackgroundMode('sync_both');
      setPendingSyncBothLocalOnlyIds(localOnlyIds);
      setPendingSyncBothServerOnlyIds(serverOnlyIds);
      if (localOnlyIds.length > 0) {
        setLastSyncRecoveryCount(localOnlyIds.length);
      }
    } else {
      setPendingBackgroundMode('mirror_from_server');
    }
  } else if (serverHasProjects) {
    await writeLocalIndex(serverIndex);
    setServerSyncEnabled(true);
    setPendingBackgroundMode('mirror_from_server');
  } else if (localHasProjects && serverHasExplicitEmptyIndex) {
    const emptyIndex = {
      ...serverIndex,
      activeProjectId: null,
      projects: [],
    };
    await writeLocalIndex(emptyIndex);
    for (const row of localIndex.projects ?? []) {
      if (!row?.id) continue;
      try {
        await deleteProjectDocumentSerialised(row.id);
      } catch {
        /* ignore cache cleanup failures */
      }
      try {
        localStorage.removeItem(projectStorageKey(row.id));
        localStorage.removeItem(projectRevisionStorageKey(row.id));
      } catch {
        /* localStorage may be unavailable */
      }
    }
    try {
      const { purgeOrphanProjectBodies } = await import('../workspaceIntegrity.js');
      await purgeOrphanProjectBodies(emptyIndex);
    } catch (e) {
      console.warn('Could not purge local projects after empty server sync:', e?.message ?? e);
    }
    setServerSyncEnabled(true);
    setPendingBackgroundMode('none');
  } else if (localHasProjects) {
    setServerSyncEnabled(true);
    setPendingBackgroundMode('migrate_local');
  } else {
    setServerSyncEnabled(true);
    setPendingBackgroundMode('none');
  }

  return {
    mode: 'server',
    serverSyncEnabled: true,
    apiAvailable: true,
    pendingBackgroundMode: getPendingBackgroundMode(),
    coldBrowserNoProjects: getPendingColdBrowserHint(),
  };
}

/** Fast boot init: index only, no project body download or migration. */
export async function initializeProjectSync() {
  if (getQuickInitDone()) {
    return {
      mode: getServerSyncEnabled() ? 'server' : 'local-only',
      serverSyncEnabled: getServerSyncEnabled(),
    };
  }
  let promise = getQuickInitPromise();
  if (!promise) {
    promise = runQuickInitBody().then((result) => {
      setQuickInitDone(true);
      return result;
    });
    setQuickInitPromise(promise);
  }
  return promise;
}

async function runBackgroundSyncBody() {
  if (!getServerSyncEnabled() || getPendingBackgroundMode() === 'none') return;

  const index = await readLocalIndex();
  if (!index?.projects?.length) return;

  const { healProjectsMissingServerDocuments } = await import('./projectSyncIndex.js');
  await healProjectsMissingServerDocuments(index);

  const mode = getPendingBackgroundMode();

  if (mode === 'mirror_from_server') {
    const activeId =
      index.activeProjectId
      ?? index.projects.find((p) => !p.archived)?.id
      ?? index.projects[0]?.id;
    for (const row of index.projects) {
      if (!(await readLocalProjectSerialised(row.id))) {
        await pullProjectDocumentIfServerNewer(row.id);
      }
    }
    if (activeId) {
      const raw = await readLocalProjectSerialised(activeId);
      let localCanvas = 0;
      try {
        if (raw) localCanvas = projectCardCount(JSON.parse(raw));
      } catch {
        /* ignore */
      }
      if (localCanvas === 0) {
        await pullProjectDocumentIfServerNewer(activeId, { force: false });
      }
    }
    const { reconcileWorkspaceIndex } = await import('../projectReconcile.js');
    const current = await readLocalIndex();
    if (current && activeId) {
      const reconciled = await reconcileWorkspaceIndex(current, {
        scope: 'active',
        activeProjectId: activeId,
      });
      await writeLocalIndex(reconciled);
    }
    return;
  }

  if (mode === 'migrate_local') {
    let migrated = 0;
    for (const row of index.projects) {
      const raw = await readLocalProjectSerialised(row.id);
      if (!raw) continue;
      try {
        const payload = JSON.parse(raw);
        const result = await saveCanvasProject(row.id, payload, 0);
        applyServerProjectRevision(row.id, result.updatedAt, result.revision);
        migrated += 1;
      } catch (e) {
        console.error(`Failed to migrate project ${row.id}:`, e);
      }
    }
    try {
      await saveCanvasIndex(index);
    } catch (e) {
      console.error('Failed to migrate project index:', e);
    }
    if (migrated > 0) {
      setLastSyncRecoveryCount(migrated);
      console.log(
        `Migrated ${migrated} project(s) to server storage. Other browsers can refresh to see them.`,
      );
    }
    setPendingBackgroundMode('none');
    return;
  }

  if (mode === 'sync_both') {
    const localOnlyIds = [...getPendingSyncBothLocalOnlyIds()];
    const serverOnlyIds = [...getPendingSyncBothServerOnlyIds()];
    setPendingSyncBothLocalOnlyIds([]);
    setPendingSyncBothServerOnlyIds([]);
    setPendingBackgroundMode('none');

    let uploaded = 0;
    try {
      await saveCanvasIndex(index);
    } catch (e) {
      console.error('Failed to sync merged project index:', e);
    }

    for (const projectId of localOnlyIds) {
      const raw = await readLocalProjectSerialised(projectId);
      if (!raw) continue;
      try {
        const result = await saveCanvasProject(projectId, JSON.parse(raw), 0);
        if (result.ok) {
          applyServerProjectRevision(projectId, result.updatedAt, result.revision);
          await patchIndexDocumentRevision(projectId, result.revision, result.updatedAt);
          uploaded += 1;
        }
      } catch (e) {
        console.error(`Failed to upload project ${projectId}:`, e);
      }
    }

    for (const row of index.projects) {
      if (
        serverOnlyIds.includes(row.id)
        || (!localOnlyIds.includes(row.id) && !(await readLocalProjectSerialised(row.id)))
      ) {
        await pullProjectDocumentIfServerNewer(row.id);
      }
    }

    const { reconcileWorkspaceIndex } = await import('../projectReconcile.js');
    const current = await readLocalIndex();
    if (current) {
      const reconciled = await reconcileWorkspaceIndex(current, { scope: 'all' });
      await writeLocalIndex(reconciled);
    }

    if (uploaded > 0) {
      bumpLastSyncRecoveryCount(uploaded);
      console.log(
        `Synced ${uploaded} project(s) to server (merged index). Other browsers can refresh to see them.`,
      );
    }
  }
}

/** Mirror project bodies / migrate local data after UI is visible. */
export function runProjectSyncBackground() {
  if (!getQuickInitDone()) {
    return initializeProjectSync().then(() => runProjectSyncBackground());
  }
  let promise = getBackgroundSyncPromise();
  if (!promise) {
    promise = runBackgroundSyncBody().catch((e) => {
      console.error('Background project sync failed:', e);
    }).finally(() => {
      setBackgroundSyncPromise(null);
    });
    setBackgroundSyncPromise(promise);
  }
  return promise;
}

import { useCallback, useEffect, useRef } from 'react';
import { loadFolderHandle } from '../../lib/folderStore.js';
import { verifyFolderHandleStored } from '../../lib/folderPersist.js';
import {
  linkFolderForProject,
  reconnectFolderForProject,
} from '../../lib/restoreFolder.js';
import { setCachedFolderHandle } from '../../lib/folderSessionCache.js';
import { deriveFolderLinkState, resolveFolderSyncAction } from '../../lib/folderLinkState.js';
import {
  MANUAL_SYNC_TIMEOUT_MS,
  clearManualSyncSpinnerFlags,
  manualSyncTimeoutPromise,
  buildManualSyncSuccessMessage,
} from '../../lib/sync/manualSync.js';
import {
  isFolderPickerBusyError,
  isFolderPickerIdError,
  pickProjectDirectoryHandle,
} from '../../lib/folderPicker.js';
import { scanFolderFiles } from '../../lib/folderScan.js';
import {
  parseFilename,
  toCanonicalSyncKey,
  unionFolderPresentKeys,
} from '../../lib/filename.js';
import { cardTypeFromSync } from '../../lib/ingest/artifactType.js';
import {
  hydrateCardsPreviews,
  cardsPreviewsChanged,
} from '../../lib/previewHydrate.js';
import { mergeDiskPreviewIntoCardVersions } from '../../lib/sync.js';
import { strings } from '../../content/strings.js';
import { flowTrace } from '../../lib/sync/syncTrace.js';
import {
  buildStagedSyncCardFromChange,
  artifactRefFromSyncEntry,
  buildConfirmChangesForDialog,
  buildFolderConnectConfirmChanges,
  buildSyncChangesFromFolder,
  findSyncEntryByFolderKey,
  missingDockOnlyStagedRows,
  partitionSyncChanges,
} from '../../lib/syncStaging.js';
import {
  enforceExclusivePlacement,
  resolvePlacement,
  upsertOnSurface,
} from '../../lib/artifactPlacement.js';
import { collectKnownAgentChatKeys } from '../../lib/agentChatThreads.js';
import { readSuppressedSyncKeys } from '../../lib/syncSuppressedKeys.js';
import { resolveScanExitStatus } from '../../lib/syncScanning.js';
import {
  ingestFoundFiles,
  buildPreviousArtifactMap,
  applyArtifactRefsToGrouped,
  mergeArtifactRefsIntoCards,
} from '../../lib/ingest/syncIngest.js';
import { auditPlacementStep } from '../../lib/placementAudit.js';
import {
  patchPlacementsMapFromArrays,
  buildPlacementsFromArrays,
} from '../../lib/artifactPlacementsMap.js';
import { getCommittedPayload } from '../../lib/persistence.js';
import { requestActionSync } from '../../lib/actionSync.js';
import { deleteProjectArtifactPrimitive } from '../../lib/primitivesApi.js';
import { runExclusive } from '../../lib/projectSyncCoordinator.js';
import { isServerSyncEnabled, setConnectedFolder, projectsForMenuFromIndex } from '../../lib/projects.js';

function folderLinkDebug(stage, meta = {}) {
  if (typeof window === 'undefined') return;
  if (window.location?.hostname !== 'localhost') return;
  console.info('[folder-link]', { stage, ...meta });
}

export const folderRepairScanOptions = (options = {}) => ({
  ...options,
  skipPlacementDefer: true,
  autoApplyImport: true,
  preferImportDialog: true,
});

export function shouldSyncCanvasFromServerAfterFolderFlow(flow) {
  return flow === 'connect';
}

export function shouldRepairFolderWithPicker(reason) {
  return reason === 'not_stored' || reason === 'denied';
}

export function folderScanOwnsProject(projectId, activeProjectId, switchingProject = false) {
  return Boolean(projectId && activeProjectId && projectId === activeProjectId && !switchingProject);
}

export function folderScanBaselineForProject({
  baseCards,
  projectId,
  activeProjectId,
  currentCards = [],
}) {
  if (baseCards !== undefined) return baseCards ?? [];
  return folderScanOwnsProject(projectId, activeProjectId, false)
    ? (currentCards ?? [])
    : [];
}

export function folderPresentKeysForSuccessfulScan(
  foundKeys,
  cards = [],
  { replaceCanvas = false, foundCount = foundKeys?.length ?? 0 } = {},
) {
  if (replaceCanvas && foundCount === 0) return [];
  return unionFolderPresentKeys(foundKeys ?? [], cards, []);
}

/**
 * Folder link, restore, and scan workflow extracted from App.jsx.
 */
export function useFolderLinkScan({
  refs,
  ui: {
    setFolderHandle,
    setFolderStoredOnDevice,
    setFolderLinkProbeComplete,
    setFolderLinkInProgress,
    setSyncStatus,
    setState,
    setStagedSyncCards,
    setProjectList,
    setConfirmChanges,
    setOpenCardId,
    setActiveCardId,
    setVersionStackOpen,
    setTrayRevealActive,
    setClusterId,
    setFolderPresentKeys,
  },
  deps: {
    loaded,
    activeProjectId,
    projectSwitchLoading,
    folderHandle,
    folderStoredOnDevice,
    folderLinkInProgress,
    folderLinkProbeComplete,
    folderPresentKeys,
    projectList,
    commitPlacementState,
    flushPendingPlacementCommit,
    applySyncChangesFromList,
    refreshGraph,
    syncCanvasFromServerAfterFolderConnect,
    loadProjectIntoStateRef,
    pullActiveProjectFromServer,
    invalidateFolderScan,
    agentChatThreadIndexRef,
    stagingDragActiveRef,
    clusterContextProjectIdRef,
  },
}) {
  const {
    activeProjectIdRef,
    committedProjectIdRef,
    projectSwitchSeqRef,
    folderRestoreHandledSeqRef,
    lastLoadedCardsRef,
    attemptRestoreRef,
    stateRef,
    stagedSyncCardsRef,
    folderScanSeqRef,
    folderPresentKeysRef,
    folderPickerInFlightRef,
    switchingProjectRef,
    setChangeFolderDialog,
  } = refs;

  const settledProjectIdRef = committedProjectIdRef ?? activeProjectIdRef;
  const directoryPickPromiseRef = useRef(null);
  const folderHandleProjectIdRef = useRef(null);

  const clearFolderPickerInProgress = useCallback(() => {
    folderPickerInFlightRef.current = false;
    setSyncStatus((prev) => {
      if (!prev?.folderPickerInProgress) return prev ?? null;
      const next = { ...prev };
      delete next.folderPickerInProgress;
      return Object.keys(next).length > 0 ? next : null;
    });
  }, [folderPickerInFlightRef]);

  const pickDirectoryExclusive = useCallback(
    async (projectId) => {
      if (directoryPickPromiseRef.current) {
        folderLinkDebug('picker:reuse-in-flight', { projectId });
        return directoryPickPromiseRef.current;
      }
      clearFolderPickerInProgress();
      folderPickerInFlightRef.current = true;
      setSyncStatus((prev) => ({ ...(prev ?? {}), folderPickerInProgress: true }));
      folderLinkDebug('picker:open', { projectId });

      const promise = (async () => {
        try {
          const handle = await pickProjectDirectoryHandle(projectId);
          folderLinkDebug('picker:selected', {
            projectId,
            folderName: handle?.name ?? null,
          });
          return handle;
        } catch (e) {
          folderLinkDebug('picker:error', {
            projectId,
            name: e?.name ?? null,
            message: e?.message ?? String(e),
          });
          throw e;
        } finally {
          clearFolderPickerInProgress();
          folderLinkDebug('picker:closed', { projectId });
        }
      })();

      directoryPickPromiseRef.current = promise;
      try {
        return await promise;
      } finally {
        if (directoryPickPromiseRef.current === promise) {
          directoryPickPromiseRef.current = null;
        }
      }
    },
    [clearFolderPickerInProgress, folderPickerInFlightRef],
  );

  const persistFolderConnection = useCallback(async (handle) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || !handle) return false;

    folderLinkDebug('persist:start', {
      projectId,
      folderName: handle.name ?? null,
    });
    setFolderHandle(handle);
    folderHandleProjectIdRef.current = projectId;
    setCachedFolderHandle(projectId, handle);
    folderLinkDebug('persist:session-linked', {
      projectId,
      folderName: handle.name ?? null,
    });

    let stored = false;
    try {
      stored = await verifyFolderHandleStored(projectId, handle);
    } catch {
      stored = false;
    }

    setFolderStoredOnDevice(stored);
    if (!stored) {
      setSyncStatus({ toast: strings.sync.folderSaveFailed });
      setTimeout(() => setSyncStatus(null), 5000);
    }

    try {
      const index = await setConnectedFolder(projectId, handle.name);
      if (index?.projects) setProjectList(projectsForMenuFromIndex(index));
      folderLinkDebug('persist:index-updated', {
        projectId,
        folderName: handle.name ?? null,
        stored,
      });
    } catch (e) {
      folderLinkDebug('persist:index-update-failed', {
        projectId,
        folderName: handle.name ?? null,
        message: e?.message ?? String(e),
      });
      setSyncStatus({ toast: strings.sync.folderSaveFailed });
      setTimeout(() => setSyncStatus(null), 5000);
    }
    flowTrace('folder:link-done', {
      projectId,
      folderName: handle.name,
      stored,
    });
    return true;
  }, []);

  const linkProjectFolder = useCallback(
    async (projectId, { requestIfNeeded = false, switchSeq = null } = {}) => {
      if (!projectId || !window.showDirectoryPicker) {
        folderLinkDebug('restore:unsupported-or-no-project', {
          projectId: projectId ?? null,
          hasPicker: Boolean(window.showDirectoryPicker),
        });
        setFolderStoredOnDevice(false);
        setFolderLinkProbeComplete(true);
        return {
          handle: null,
          granted: false,
          stored: false,
          needsPermission: false,
        };
      }
      const stale = () =>
        switchSeq != null && projectSwitchSeqRef.current !== switchSeq;
      try {
        folderLinkDebug('restore:start', {
          projectId,
          requestIfNeeded,
          switchSeq,
        });
        const result = await linkFolderForProject(projectId, { requestIfNeeded });
        if (stale()) return result;
        folderLinkDebug('restore:result', {
          projectId,
          granted: result.granted,
          stored: result.stored,
          needsPermission: result.needsPermission,
          hasHandle: Boolean(result.handle),
          folderName: result.handle?.name ?? null,
        });
        setFolderStoredOnDevice(result.stored);
        if (result.granted && result.handle) {
          setFolderHandle(result.handle);
          folderHandleProjectIdRef.current = projectId;
        } else if (
          !folderPickerInFlightRef.current
          && folderHandleProjectIdRef.current !== projectId
        ) {
          folderLinkDebug('restore:clear-handle', {
            projectId,
            currentHandleProjectId: folderHandleProjectIdRef.current,
          });
          setFolderHandle(null);
          folderHandleProjectIdRef.current = null;
        }
        return result;
      } catch {
        try {
          const handle = await loadFolderHandle(projectId);
          setFolderStoredOnDevice(Boolean(handle));
        } catch {
          setFolderStoredOnDevice(false);
        }
        if (
          !folderPickerInFlightRef.current
          && folderHandleProjectIdRef.current !== projectId
        ) {
          folderLinkDebug('restore:catch-clear-handle', {
            projectId,
            currentHandleProjectId: folderHandleProjectIdRef.current,
          });
          setFolderHandle(null);
          folderHandleProjectIdRef.current = null;
        }
        return {
          handle: null,
          granted: false,
          stored: false,
          needsPermission: false,
        };
      } finally {
        if (!stale()) {
          setFolderLinkProbeComplete(true);
        }
      }
    },
    [],
  );

  const warnFolderNameMismatch = useCallback((projectId, handle) => {
    if (!handle?.name || !projectId) return;
    const row = projectList.find((p) => p.id === projectId);
    const expected = row?.connectedFolderName?.trim();
    if (expected && handle.name !== expected) {
      setSyncStatus({
        toast: strings.sync.folderNameMismatch(expected, handle.name),
      });
      setTimeout(() => setSyncStatus(null), 6000);
    }
  }, [projectList]);

  const scanFolder = useCallback(async (handle, options = {}) => {
    const {
      baseCards,
      replaceCanvas = false,
      projectId: projectIdOption,
      signal,
      _placementDeferCount = 0,
      skipPlacementDefer = false,
      autoApplyImport = false,
      preferImportDialog = false,
    } = options;
    const scanSeq = ++folderScanSeqRef.current;
    const isScanStale = () => scanSeq !== folderScanSeqRef.current || signal?.aborted;
    flowTrace('folder:scan-start', {
      projectId: projectIdOption ?? settledProjectIdRef.current,
      scanSeq,
      autoApplyImport,
    });
    if (!projectIdOption && switchingProjectRef.current) return;
    const projectIdEarly = projectIdOption ?? settledProjectIdRef.current;
    const { isSyncGateIdle, getSyncGateLabel } = await import('../../lib/syncGate.js');
    if (
      !skipPlacementDefer
      && !isSyncGateIdle()
      && getSyncGateLabel()?.includes('placementTransfer')
      && _placementDeferCount < 3
    ) {
      setTimeout(() => {
        void scanFolder(handle, {
          ...options,
          projectId: projectIdEarly,
          _placementDeferCount: _placementDeferCount + 1,
        });
      }, 800);
      return;
    }
    const cardsBaseline = folderScanBaselineForProject({
      baseCards,
      projectId: projectIdEarly,
      activeProjectId: settledProjectIdRef.current,
      currentCards: stateRef.current.cards ?? [],
    });
    const projectId = projectIdOption ?? settledProjectIdRef.current;
    setSyncStatus({ scanning: true });
    const scanSpinnerTimeoutId = setTimeout(() => {
      setSyncStatus((prev) => (prev?.scanning ? null : prev));
    }, 120_000);
    let exitStatus = null;
    let folderScanProjectId = null;
    try {
    let found = [];
    try {
      const scan = await scanFolderFiles(handle, {
        projectId,
        isStale: isScanStale,
      });
      found = scan.found;
      if (scan.truncated) {
        flowTrace('folder:scan-truncated', {
          projectId,
          scanSeq,
          foundCount: found.length,
        });
      }
    } catch (e) {
      exitStatus = { error: e.message };
      return;
    }
    // Group by base (prefix__name) to build version stacks
    const grouped = {};
    found.forEach(f => {
      const parsed = parseFilename(f.filename);
      const key = f.cardKey || toCanonicalSyncKey(f.relativePath || f.filename);
      if (!grouped[key]) grouped[key] = { parsed, versions: [] };
      grouped[key].versions.push({ ...f, ...parsed });
    });
    Object.values(grouped).forEach(g => g.versions.sort((a, b) => b.version - a.version));

    let groupedFinal = grouped;
    if (projectId) {
      const flat = [];
      Object.entries(grouped).forEach(([cardKey, group]) => {
        const existing = findSyncEntryByFolderKey(cardsBaseline, cardKey);
        group.versions.forEach((v) => {
          const cardType = cardTypeFromSync({
            ext: v.ext || group.parsed.ext,
            existingCardType: existing?.type,
            prefix: v.prefix || group.parsed.prefix,
            name: v.name || group.parsed.name,
          });
          flat.push({ ...v, cardKey, cardType });
        });
      });
      try {
        const ingest = await ingestFoundFiles(
          projectId,
          stateRef.current.projectName,
          flat,
          buildPreviousArtifactMap(cardsBaseline),
        );
        if (ingest.ok) {
          groupedFinal = applyArtifactRefsToGrouped(grouped, ingest.byFilename);
          if (ingest.clusterId) {
            clusterContextProjectIdRef.current = projectId;
            setClusterId(ingest.clusterId);
          }
          setState((prev) => ({
            ...prev,
            cards: mergeArtifactRefsIntoCards(prev.cards, groupedFinal),
          }));
          setTimeout(
            () =>
              void refreshGraph({
                clusterId: ingest.clusterId,
                projectId,
                force: true,
              }),
            0,
          );
        } else if (ingest.reason === 'api_unavailable') {
          exitStatus = { toast: strings.sync.primitivesNotUpdated };
          setTimeout(() => setSyncStatus(null), 4000);
        }
      } catch {
        /* primitives API optional when server is down */
      }
    }

    const foundKeys = Object.keys(groupedFinal);
    const missingDockRows = missingDockOnlyStagedRows(
      foundKeys,
      stateRef.current.cards ?? [],
      stagedSyncCardsRef.current ?? [],
    );
    if (missingDockRows.length > 0 && !isScanStale()) {
      const scanProjectId = projectIdOption ?? activeProjectIdRef.current;
      const missingRows = new Set(missingDockRows);
      const stagedBeforePrune = stagedSyncCardsRef.current ?? [];
      const nextStaged = stagedBeforePrune.filter((row) => !missingRows.has(row));
      const artifactRefs = [
        ...new Map(
          missingDockRows
            .map((row) => artifactRefFromSyncEntry(row))
            .filter((ref) => ref?.id)
            .map((ref) => [ref.id, ref]),
        ).values(),
      ];

      stagedSyncCardsRef.current = nextStaged;
      setStagedSyncCards(nextStaged);

      if (scanProjectId) {
        const patchedMap = patchPlacementsMapFromArrays(
          getCommittedPayload(scanProjectId)?.artifactPlacements
          ?? buildPlacementsFromArrays(stateRef.current.cards ?? [], stagedBeforePrune),
          stateRef.current.cards ?? [],
          nextStaged,
        );
        try {
          await commitPlacementState(scanProjectId, {
            artifactPlacements: patchedMap,
            reason: 'folderScan:missingDockPrune',
          });
        } catch (e) {
          console.warn('Missing dock placement commit failed:', e);
        }

        for (const ref of artifactRefs) {
          try {
            await deleteProjectArtifactPrimitive(scanProjectId, ref.id);
          } catch (e) {
            flowTrace('folder:missing-dock-cleanup-skipped', {
              projectId: scanProjectId,
              artifactId: ref.id,
              reason: e?.message ?? String(e),
            });
            console.warn('Missing dock primitive cleanup failed:', e);
          }
        }
        if (artifactRefs.length > 0) {
          void refreshGraph({ projectId: scanProjectId, force: true });
        }
      }
    }

    // On read errors we keep the previous key set; on success refresh presence for missing-file UI.
    // Dock rows are deliberately excluded so missing dock-only files can be pruned.
    setFolderPresentKeys(
      folderPresentKeysForSuccessfulScan(
        foundKeys,
        stateRef.current.cards ?? [],
        { replaceCanvas, foundCount: found.length },
      ),
    );

    const stagedBaseline = stagedSyncCardsRef.current ?? [];
    const suppressedKeys = readSuppressedSyncKeys(projectId, stateRef.current);
    const { changes, refreshPatches, stagedRefreshPatches } = buildSyncChangesFromFolder(
      groupedFinal,
      cardsBaseline,
      stagedBaseline,
    );
    const filteredChanges = changes
      .filter((c) => !suppressedKeys.has(c.key))
      .filter((c) => !suppressedKeys.has(toCanonicalSyncKey(c.key)));
    const knownAgentChatKeys = collectKnownAgentChatKeys(
      agentChatThreadIndexRef.current,
    );
    const { autoStageAgentChat } = partitionSyncChanges(filteredChanges);

    if (isScanStale()) {
      exitStatus = { noChanges: true };
      return;
    }

    if (autoStageAgentChat.length > 0) {
      let nextStaged = stagedBaseline;
      let nextCards = cardsBaseline;
      for (const change of autoStageAgentChat) {
        if (isScanStale()) break;
        if (resolvePlacement(nextCards, nextStaged, change.key) === 'canvas') {
          continue;
        }
        const staged = buildStagedSyncCardFromChange(change);
        const upserted = upsertOnSurface(nextCards, nextStaged, {
          key: change.key,
          surface: 'dock',
          payload: staged,
          opts: { threads: agentChatThreadIndexRef.current?.threads ?? [] },
        });
        nextCards = upserted.cards;
        nextStaged = upserted.stagedSyncCards;
      }
      const exclusive = enforceExclusivePlacement(nextCards, nextStaged, {
        threads: agentChatThreadIndexRef.current?.threads ?? [],
      });
      setStagedSyncCards(exclusive.stagedSyncCards);
      stagedSyncCardsRef.current = exclusive.stagedSyncCards;
      if (exclusive.changed) {
        stateRef.current = { ...stateRef.current, cards: exclusive.cards };
        setState((prev) => ({ ...prev, cards: exclusive.cards }));
      }
      const scanProjectId = projectIdOption ?? activeProjectIdRef.current;
      if (scanProjectId && exclusive.changed) {
        const patchedMap = patchPlacementsMapFromArrays(
          getCommittedPayload(scanProjectId)?.artifactPlacements
          ?? buildPlacementsFromArrays(exclusive.cards, exclusive.stagedSyncCards),
          exclusive.cards,
          exclusive.stagedSyncCards,
        );
        try {
          await commitPlacementState(scanProjectId, {
            artifactPlacements: patchedMap,
            reason: 'folderScan:agentStage',
          });
        } catch (e) {
          console.warn('Folder scan placement commit failed:', e);
        }
      }
      if (
        autoStageAgentChat.some(
          (c) => !findSyncEntryByFolderKey(stagedBaseline, c.key),
        )
      ) {
        setTrayRevealActive(true);
      }
    }

    const deferPreviewMergeForImportDialog = preferImportDialog;

    if (stagedRefreshPatches.length > 0 && !deferPreviewMergeForImportDialog) {
      const stagedRefreshByKey = new Map(stagedRefreshPatches.map((p) => [p.key, p.group]));
      setStagedSyncCards((prev) =>
        prev.map((s) => {
          const group = stagedRefreshByKey.get(s.key);
          if (!group) return s;
          return {
            ...s,
            versions: mergeDiskPreviewIntoCardVersions(s.versions, group.versions),
          };
        }),
      );
    }

    const refreshByCanonical = new Map(
      refreshPatches.map((p) => [toCanonicalSyncKey(p.key), p.group]),
    );

    const canvasNow = stateRef.current.cards ?? [];
    const stagedNow = stagedSyncCardsRef.current ?? [];
    const buildConfirmList = () => {
      if (scanSeq !== folderScanSeqRef.current || stagingDragActiveRef.current) {
        return [];
      }
      const opts = { suppressedKeys, knownAgentChatKeys };
      if (preferImportDialog) {
        return buildFolderConnectConfirmChanges(
          groupedFinal,
          canvasNow,
          stagedNow,
          opts,
        );
      }
      return buildConfirmChangesForDialog(groupedFinal, canvasNow, stagedNow, opts);
    };
    const confirmChangesList = buildConfirmList();

    const willClearCanvas = confirmChangesList.length === 0 && replaceCanvas;
    const skipInlinePreviewMerge =
      deferPreviewMergeForImportDialog && confirmChangesList.length > 0;
    if (refreshPatches.length > 0 && !willClearCanvas && !skipInlinePreviewMerge) {
      let mergedCards = null;
      setState((prev) => {
        mergedCards = (prev.cards ?? []).map((c) => {
          const group =
            refreshByCanonical.get(toCanonicalSyncKey(c.key))
            ?? refreshByCanonical.get(toCanonicalSyncKey(c.versions?.[0]?.filename));
          if (!group) return c;
          return { ...c, versions: mergeDiskPreviewIntoCardVersions(c.versions, group.versions) };
        });
        return { ...prev, cards: mergedCards };
      });
      const hydrated = await hydrateCardsPreviews(mergedCards);
      if (cardsPreviewsChanged(mergedCards, hydrated)) {
        setState((prev) => ({ ...prev, cards: hydrated }));
      }
    }

    if (confirmChangesList.length === 0) {
      exitStatus =
        refreshPatches.length > 0 ? { previewsRestored: true } : { noChanges: true };
      if (preferImportDialog && found.length === 0) {
        setSyncStatus((prev) => ({
          ...(prev ?? {}),
          toast: strings.sync.folderScanNoFiles,
        }));
        setTimeout(() => setSyncStatus(null), 6000);
      }
      if (replaceCanvas) {
        setState(prev => ({ ...prev, cards: [] }));
        setOpenCardId(null);
        setActiveCardId(null);
        setVersionStackOpen(null);
      }
      setTimeout(() => setSyncStatus(null), 2000);
    } else if (
      scanSeq === folderScanSeqRef.current
      && !isScanStale()
    ) {
      const applyMode = replaceCanvas ? 'replace' : 'merge';
      if (autoApplyImport && confirmChangesList.length > 0) {
        const applied = applySyncChangesFromList?.({
          changes: confirmChangesList,
          applyMode,
        });
        if (applied?.newlyStagedCount > 0) {
          setTrayRevealActive(true);
        }
        exitStatus = { previewsRestored: true };
      } else {
        setConfirmChanges({
          changes: confirmChangesList,
          applyMode,
        });
        setSyncStatus((prev) => ({
          ...(prev ?? {}),
          toast: strings.sync.folderImportReady(confirmChangesList.length),
        }));
        exitStatus = null;
      }
    } else {
      flowTrace('folder:scan-stale', {
        projectId,
        scanSeq,
        scanSeqNow: folderScanSeqRef.current,
        preferImportDialog,
        foundCount: found.length,
      });
      exitStatus = { noChanges: true };
      setTimeout(() => setSyncStatus(null), 2000);
    }
    } catch (e) {
      exitStatus = { error: e.message };
    } finally {
      clearTimeout(scanSpinnerTimeoutId);
      setSyncStatus((prev) => resolveScanExitStatus(prev, exitStatus));
      folderScanProjectId =
        !exitStatus?.error
          ? (projectIdOption ?? activeProjectIdRef.current)
          : null;
      flowTrace('folder:scan-done', {
        projectId: folderScanProjectId,
        scanSeq,
        stale: isScanStale(),
        exitStatus: exitStatus ? Object.keys(exitStatus) : ['ok'],
      });
    }
    if (folderScanProjectId) {
      const cached = getCommittedPayload(folderScanProjectId);
      if (cached) {
        auditPlacementStep('folderScan:before-sync', cached, {
          projectId: folderScanProjectId,
        });
      }
      try {
        await requestActionSync('folderScan', { projectId: folderScanProjectId });
      } catch (e) {
        console.warn('Folder scan action sync failed:', e);
      }
    }
  }, [
    commitPlacementState,
    refreshGraph,
    invalidateFolderScan,
    applySyncChangesFromList,
  ]);

  const probeFolderStoredOnDevice = useCallback(async (projectId) => {
    if (!projectId) {
      setFolderStoredOnDevice(false);
      setFolderLinkProbeComplete(true);
      return false;
    }
    try {
      const handle = await loadFolderHandle(projectId);
      if (projectId === activeProjectIdRef.current) {
        setFolderStoredOnDevice(Boolean(handle));
        setFolderLinkProbeComplete(true);
      }
      return Boolean(handle);
    } catch {
      if (projectId === activeProjectIdRef.current) {
        setFolderStoredOnDevice(false);
        setFolderLinkProbeComplete(true);
      }
      return false;
    }
  }, [activeProjectIdRef]);

  const attemptRestoreFolderForProject = useCallback(
    async (projectId, cardsBaseline, options = {}) => {
      const {
        requestIfNeeded = false,
        scan = true,
        switchSeq = null,
      } = options;
      if (!projectId || !window.showDirectoryPicker) {
        setFolderStoredOnDevice(false);
        setFolderLinkProbeComplete(true);
        return;
      }
      if (projectId === activeProjectIdRef.current) {
        setFolderLinkProbeComplete(false);
      }
      const stale = () =>
        switchSeq != null && projectSwitchSeqRef.current !== switchSeq;
      const scanBaseline =
        cardsBaseline !== undefined
          ? (cardsBaseline ?? [])
          : projectId === activeProjectIdRef.current
            ? (stateRef.current.cards ?? [])
            : [];
      try {
        folderLinkDebug('restore-attempt:start', {
          projectId,
          requestIfNeeded,
          scan,
          switchSeq,
        });
        const result = await linkProjectFolder(projectId, {
          requestIfNeeded,
          switchSeq,
        });
        if (stale()) return;
        if (result.granted && result.handle && scan) {
          warnFolderNameMismatch(projectId, result.handle);
          const liveBaseline =
            projectId === activeProjectIdRef.current
              ? (stateRef.current.cards ?? scanBaseline)
              : scanBaseline;
          await scanFolder(result.handle, {
            baseCards: liveBaseline,
            projectId,
          });
        }
      } catch {
        try {
          const handle = await loadFolderHandle(projectId);
          setFolderStoredOnDevice(Boolean(handle));
        } catch {
          setFolderStoredOnDevice(false);
        }
        if (
          !folderPickerInFlightRef.current
          && folderHandleProjectIdRef.current !== projectId
        ) {
          setFolderHandle(null);
        }
      } finally {
        if (
          projectId === activeProjectIdRef.current
          && (switchSeq == null || projectSwitchSeqRef.current === switchSeq)
        ) {
          setFolderLinkProbeComplete(true);
          folderRestoreHandledSeqRef.current = {
            projectId,
            switchSeq: projectSwitchSeqRef.current,
          };
        }
      }
    },
    [linkProjectFolder, scanFolder, warnFolderNameMismatch, folderRestoreHandledSeqRef],
  );

  useEffect(() => {
    attemptRestoreRef.current = attemptRestoreFolderForProject;
  }, [attemptRestoreFolderForProject, attemptRestoreRef]);

  useEffect(() => {
    if (!folderHandle) setFolderPresentKeys(null);
  }, [folderHandle]);

  useEffect(() => {
    folderPresentKeysRef.current = folderPresentKeys;
  }, [folderPresentKeys]);

  useEffect(() => {
    if (!activeProjectId) {
      setFolderHandle(null);
      folderHandleProjectIdRef.current = null;
      setFolderStoredOnDevice(false);
      setFolderLinkProbeComplete(true);
      return;
    }
    if (folderHandleProjectIdRef.current !== activeProjectId) {
      setFolderHandle(null);
      folderHandleProjectIdRef.current = null;
    }
    setFolderLinkProbeComplete(false);
    void probeFolderStoredOnDevice(activeProjectId);
  }, [activeProjectId, probeFolderStoredOnDevice]);

  useEffect(() => {
    if (
      !loaded
      || projectSwitchLoading
      || !activeProjectId
      || switchingProjectRef.current
      || folderLinkInProgress
    ) {
      return;
    }
    const handled = folderRestoreHandledSeqRef.current;
    if (
      handled?.projectId === activeProjectId
      && handled.switchSeq === projectSwitchSeqRef.current
    ) {
      return;
    }
    void attemptRestoreRef.current(activeProjectId, lastLoadedCardsRef.current, {
      requestIfNeeded: false,
    });
  }, [loaded, projectSwitchLoading, activeProjectId, folderLinkInProgress]);

  useEffect(() => {
    if (!loaded || !activeProjectId) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (projectSwitchLoading || switchingProjectRef.current) return;
      void attemptRestoreRef.current(
        activeProjectIdRef.current,
        lastLoadedCardsRef.current,
      );
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loaded, activeProjectId, projectSwitchLoading]);

  const pickProjectDirectory = pickDirectoryExclusive;

  useEffect(() => {
    clearFolderPickerInProgress();
    directoryPickPromiseRef.current = null;
  }, [clearFolderPickerInProgress]);

  const finishFolderConnectFlow = useCallback(
    async (projectId, handle) => {
      folderLinkDebug('connect:finish-start', {
        projectId,
        folderName: handle?.name ?? null,
      });
      const linked = await persistFolderConnection(handle);
      if (!linked) return;
      // Block attemptRestore from starting a competing scan during connect.
      folderRestoreHandledSeqRef.current = {
        projectId,
        switchSeq: projectSwitchSeqRef.current,
      };
      setFolderLinkProbeComplete(true);
      warnFolderNameMismatch(projectId, handle);
      stagingDragActiveRef.current = false;
      await scanFolder(handle, folderRepairScanOptions({
        baseCards: stateRef.current.cards ?? [],
        projectId,
      }));
      if (shouldSyncCanvasFromServerAfterFolderFlow('connect')) {
        void syncCanvasFromServerAfterFolderConnect(projectId);
      }
      await flushPendingPlacementCommit?.();
      folderLinkDebug('connect:finish-done', {
        projectId,
        folderName: handle?.name ?? null,
      });
    },
    [
      persistFolderConnection,
      warnFolderNameMismatch,
      scanFolder,
      syncCanvasFromServerAfterFolderConnect,
      flushPendingPlacementCommit,
    ],
  );

  const requestFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      setSyncStatus({ error: strings.sync.folderUnsupported });
      return;
    }
    const projectId = activeProjectIdRef.current;
    if (!projectId) {
      setSyncStatus({ error: strings.projects.noActiveProject });
      setTimeout(() => setSyncStatus(null), 4000);
      return;
    }
    setFolderLinkInProgress(true);
    setFolderLinkProbeComplete(false);
    try {
      folderLinkDebug('connect:picker-start', { projectId });
      const handle = await pickDirectoryExclusive(projectId);
      folderLinkDebug('connect:picker-returned', {
        projectId,
        folderName: handle?.name ?? null,
      });
      await finishFolderConnectFlow(projectId, handle);
    } catch (e) {
      folderLinkDebug('connect:error', {
        projectId,
        name: e?.name ?? null,
        message: e?.message ?? String(e),
      });
      if (e.name !== 'AbortError') {
        const message = isFolderPickerBusyError(e)
          ? strings.sync.folderPickerBusy
          : isFolderPickerIdError(e)
            ? strings.sync.folderPickerIdInvalid
            : e.message;
        setSyncStatus({ error: message });
        setTimeout(() => setSyncStatus(null), 6000);
      }
    } finally {
      setFolderLinkProbeComplete(true);
      setFolderLinkInProgress(false);
    }
  }, [pickDirectoryExclusive, finishFolderConnectFlow]);

  const importFilesToDock = useCallback(
    async (files) => {
      const projectId = activeProjectIdRef.current;
      const selected = Array.from(files ?? []).filter(Boolean);
      if (!projectId) {
        setSyncStatus({ error: strings.projects.noActiveProject });
        setTimeout(() => setSyncStatus(null), 4000);
        return;
      }
      if (selected.length === 0) {
        setSyncStatus({ toast: strings.sync.folderScanNoFiles });
        setTimeout(() => setSyncStatus(null), 4000);
        return;
      }
      const handle = {
        name: strings.sync.importedFilesFolderName,
        async *values() {
          for (const file of selected) {
            yield file;
          }
        },
      };
      await scanFolder(handle, folderRepairScanOptions({
        baseCards: stateRef.current.cards ?? [],
        projectId,
      }));
      await flushPendingPlacementCommit?.();
    },
    [scanFolder, flushPendingPlacementCommit],
  );

  const applyFolderHandleAndScan = useCallback(
    async (handle, options = {}) => {
      const projectId = activeProjectIdRef.current;
      if (projectId && handle) {
        setCachedFolderHandle(projectId, handle);
      }
      setFolderHandle(handle);
      const scanOptions = {
        baseCards: lastLoadedCardsRef.current ?? stateRef.current.cards ?? [],
        projectId,
        ...options,
      };
      await scanFolder(handle, scanOptions);
    },
    [scanFolder],
  );

  const handleReconnectFolder = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || !window.showDirectoryPicker) {
      setSyncStatus({ error: strings.sync.folderUnsupported });
      return;
    }
    const repairWithPicker = async () => {
      setSyncStatus((prev) => ({
        ...(prev ?? {}),
        toast: strings.sync.repairFolderPickAgain,
      }));
      const handle = await pickDirectoryExclusive(projectId);
      const linked = await persistFolderConnection(handle);
      if (!linked) {
        setSyncStatus((prev) => (prev?.scanning ? null : prev));
        return;
      }
      warnFolderNameMismatch(projectId, handle);
      await scanFolder(
        handle,
        folderRepairScanOptions({
          baseCards: stateRef.current.cards ?? [],
          projectId,
        }),
      );
      await flushPendingPlacementCommit?.();
    };
    try {
      setSyncStatus({
        scanning: true,
        toast: strings.sync.repairFolderInProgress,
      });
      const result = await reconnectFolderForProject(projectId);
      if (result.ok && result.handle) {
        const linked = await persistFolderConnection(result.handle);
        if (!linked) {
          setSyncStatus((prev) => (prev?.scanning ? null : prev));
          return;
        }
        warnFolderNameMismatch(projectId, result.handle);
        await scanFolder(
          result.handle,
          folderRepairScanOptions({
            baseCards: stateRef.current.cards ?? [],
            projectId,
          }),
        );
        await flushPendingPlacementCommit?.();
        return;
      }
      if (shouldRepairFolderWithPicker(result.reason)) {
        await repairWithPicker();
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        setSyncStatus((prev) => (prev?.scanning ? null : prev));
      } else {
        const message = isFolderPickerBusyError(e)
          ? strings.sync.folderPickerBusy
          : e.message || strings.sync.folderPermissionDenied;
        setSyncStatus({ error: message });
        setTimeout(() => setSyncStatus(null), 4000);
      }
    }
  }, [
    persistFolderConnection,
    scanFolder,
    pickDirectoryExclusive,
    warnFolderNameMismatch,
    flushPendingPlacementCommit,
  ]);

  const handleSyncClick = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    const linkState = deriveFolderLinkState({
      folderHandle,
      folderStoredOnDevice,
      folderLinkInProgress,
      folderLinkProbeComplete,
      connectedFolderName: projectId
        ? projectList.find((p) => p.id === projectId)?.connectedFolderName ?? null
        : null,
    });
    const syncAction = resolveFolderSyncAction(linkState);

    // showDirectoryPicker must run in the same user gesture — not after pull/reconcile.
    if (syncAction === 'connect' || syncAction === 'reconnect') {
      try {
        if (syncAction === 'reconnect') {
          await handleReconnectFolder();
        } else {
          await requestFolder();
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          setSyncStatus({ error: e.message });
          setTimeout(() => setSyncStatus(null), 4000);
        }
      }
      return;
    }

    const withFolderScan = syncAction === 'scan' && Boolean(folderHandle);
    setSyncStatus({
      manualSyncing: true,
      banner: strings.sync.syncInProgress,
    });
    let pullMeta = {
      pulled: false,
      revision: null,
      missingServerDocument: false,
    };
    let syncErrored = false;
    let errorMessage = null;
    try {
      const exclusiveResult = await Promise.race([
        runExclusive(
          'manual-sync',
          async () => {
            if (projectId && isServerSyncEnabled()) {
              pullMeta = await pullActiveProjectFromServer({ showToast: false });
            }
            if (withFolderScan) {
              await scanFolder(folderHandle, {
                baseCards: lastLoadedCardsRef.current ?? stateRef.current.cards ?? [],
                projectId,
                skipPlacementDefer: true,
              });
            }
          },
          { mode: 'skip' },
        ),
        manualSyncTimeoutPromise(
          MANUAL_SYNC_TIMEOUT_MS,
          strings.sync.syncTimedOut,
        ),
      ]);
      if (exclusiveResult === null) {
        errorMessage = strings.sync.syncAlreadyInProgress;
      }
    } catch (e) {
      syncErrored = true;
      if (e.name !== 'AbortError') {
        errorMessage = e.message || strings.sync.syncTimedOut;
      }
    } finally {
      setSyncStatus((prev) => {
        const base = clearManualSyncSpinnerFlags(prev);
        if (syncErrored || errorMessage) {
          if (!errorMessage) return base;
          return { ...(base ?? {}), error: errorMessage };
        }
        if (base?.error) return base;
        const message = buildManualSyncSuccessMessage(strings, {
          pulled: pullMeta.pulled,
          revision: pullMeta.revision,
          missingServerDocument: pullMeta.missingServerDocument,
          previewsRestored: base?.previewsRestored,
          noChanges: base?.noChanges,
          withFolderScan,
          serverSyncEnabled: isServerSyncEnabled(),
        });
        return { syncSuccess: message };
      });
      if (!syncErrored && !errorMessage) {
        setTimeout(() => {
          setSyncStatus((prev) => (prev?.syncSuccess ? null : prev));
        }, 5000);
      } else if (errorMessage) {
        setTimeout(() => {
          setSyncStatus((prev) => (prev?.error === errorMessage ? null : prev));
        }, 6000);
      }
    }
  }, [
    folderHandle,
    folderStoredOnDevice,
    folderLinkInProgress,
    folderLinkProbeComplete,
    scanFolder,
    requestFolder,
    pullActiveProjectFromServer,
    projectList,
    handleReconnectFolder,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__canvasFolderSnapshot = () => {
      const projectId = activeProjectIdRef.current;
      const row = projectId
        ? projectList.find((project) => project.id === projectId)
        : null;
      const linkState = deriveFolderLinkState({
        folderHandle,
        folderStoredOnDevice,
        folderLinkInProgress,
        folderLinkProbeComplete,
        connectedFolderName: row?.connectedFolderName ?? null,
      });
      return {
        activeProjectId: activeProjectId ?? null,
        activeProjectIdRef: projectId ?? null,
        folderHandleName: folderHandle?.name ?? null,
        folderHandleProjectId: folderHandleProjectIdRef.current ?? null,
        folderStoredOnDevice,
        folderLinkInProgress,
        folderLinkProbeComplete,
        folderPickerInFlight: Boolean(folderPickerInFlightRef.current),
        connectedFolderName: row?.connectedFolderName ?? null,
        linkState,
        projectSwitchLoading,
        folderPresentKeyCount: Array.isArray(folderPresentKeys)
          ? folderPresentKeys.length
          : folderPresentKeys?.size ?? null,
      };
    };
    return () => {
      delete window.__canvasFolderSnapshot;
    };
  }, [
    activeProjectId,
    projectList,
    folderHandle,
    folderStoredOnDevice,
    folderLinkInProgress,
    folderLinkProbeComplete,
    projectSwitchLoading,
    folderPresentKeys,
  ]);

  const beginChangeFolder = useCallback(async (replaceCanvas) => {
    setChangeFolderDialog(false);
    if (!window.showDirectoryPicker) {
      setSyncStatus({ error: strings.sync.folderUnsupported });
      return;
    }
    const projectId = activeProjectIdRef.current;
    try {
      const handle = await pickDirectoryExclusive(projectId);
      await persistFolderConnection(handle);
      warnFolderNameMismatch(projectId, handle);
      await scanFolder(
        handle,
        replaceCanvas
          ? folderRepairScanOptions({
            baseCards: [],
            replaceCanvas: true,
            projectId,
          })
          : folderRepairScanOptions({
            baseCards: stateRef.current.cards,
            projectId,
          }),
      );
      await flushPendingPlacementCommit?.();
    } catch (e) {
      if (e.name !== 'AbortError') {
        const message = isFolderPickerBusyError(e)
          ? strings.sync.folderPickerBusy
          : e.message;
        setSyncStatus({ error: message });
        setTimeout(() => setSyncStatus(null), 6000);
      }
    }
  }, [
    scanFolder,
    persistFolderConnection,
    pickDirectoryExclusive,
    warnFolderNameMismatch,
    flushPendingPlacementCommit,
  ]);

  return {
    persistFolderConnection,
    linkProjectFolder,
    warnFolderNameMismatch,
    scanFolder,
    probeFolderStoredOnDevice,
    attemptRestoreFolderForProject,
    requestFolder,
    importFilesToDock,
    pickProjectDirectory,
    applyFolderHandleAndScan,
    handleReconnectFolder,
    handleSyncClick,
    beginChangeFolder,
  };
}

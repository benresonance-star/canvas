import { useCallback, useEffect } from 'react';
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
import { buildDirectoryPickerOptions } from '../../lib/folderPicker.js';
import { readFileEntry } from '../../lib/readFile.js';
import {
  parseFilename,
  toCanonicalSyncKey,
  unionFolderPresentKeys,
} from '../../lib/filename.js';
import { cardTypeFromSync } from '../../lib/ingest/artifactType.js';
import { previewCacheKey } from '../../lib/previewStore.js';
import {
  hydrateCardsPreviews,
  cardsPreviewsChanged,
} from '../../lib/previewHydrate.js';
import { mergeDiskPreviewIntoCardVersions } from '../../lib/sync.js';
import { strings } from '../../content/strings.js';
import {
  buildStagedSyncCardFromChange,
  buildConfirmChangesForDialog,
  buildSyncChangesFromFolder,
  findSyncEntryByFolderKey,
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
import { runExclusive } from '../../lib/projectSyncCoordinator.js';
import { isServerSyncEnabled, setConnectedFolder, projectsForMenuFromIndex } from '../../lib/projects.js';

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
    projectSwitchSeqRef,
    folderRestoreHandledSeqRef,
    lastLoadedCardsRef,
    attemptRestoreRef,
    stateRef,
    stagedSyncCardsRef,
    folderScanSeqRef,
    folderPresentKeysRef,
    switchingProjectRef,
    setChangeFolderDialog,
  } = refs;

  const persistFolderConnection = useCallback(async (handle) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || !handle) return;
    let stored = false;
    try {
      stored = await verifyFolderHandleStored(projectId, handle);
    } catch {
      stored = false;
    }
    if (!stored) {
      setFolderHandle(null);
      setFolderStoredOnDevice(false);
      setSyncStatus({ toast: strings.sync.folderSaveFailed });
      setTimeout(() => setSyncStatus(null), 5000);
      return;
    }
    setFolderHandle(handle);
    setFolderStoredOnDevice(true);
    setCachedFolderHandle(projectId, handle);
    const index = await setConnectedFolder(projectId, handle.name);
    if (index?.projects) setProjectList(projectsForMenuFromIndex(index));
  }, []);

  const linkProjectFolder = useCallback(
    async (projectId, { requestIfNeeded = false, switchSeq = null } = {}) => {
      if (!projectId || !window.showDirectoryPicker) {
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
        const result = await linkFolderForProject(projectId, { requestIfNeeded });
        if (stale()) return result;
        setFolderStoredOnDevice(result.stored);
        if (result.granted && result.handle) {
          setFolderHandle(result.handle);
        } else {
          setFolderHandle(null);
        }
        return result;
      } catch {
        try {
          const handle = await loadFolderHandle(projectId);
          setFolderStoredOnDevice(Boolean(handle));
        } catch {
          setFolderStoredOnDevice(false);
        }
        setFolderHandle(null);
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
    } = options;
    const scanSeq = ++folderScanSeqRef.current;
    const isScanStale = () => scanSeq !== folderScanSeqRef.current || signal?.aborted;
    const projectIdEarly = projectIdOption ?? activeProjectIdRef.current;
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
    const cardsBaseline =
      baseCards !== undefined
        ? (baseCards ?? [])
        : (projectIdEarly === activeProjectIdRef.current
          ? (stateRef.current.cards ?? [])
          : (stateRef.current.cards ?? []));
    const projectId = projectIdOption ?? activeProjectIdRef.current;
    setSyncStatus({ scanning: true });
    const scanSpinnerTimeoutId = setTimeout(() => {
      setSyncStatus((prev) => (prev?.scanning ? null : prev));
    }, 120_000);
    let exitStatus = null;
    let folderScanProjectId = null;
    try {
    const found = [];
    try {
      for await (const entry of handle.values()) {
        if (isScanStale()) break;
        if (entry.kind === 'file') {
          const parsed = parseFilename(entry.name);
          const cacheKey = projectId
            ? previewCacheKey(projectId, parsed.fullBase, parsed.version)
            : null;
          const file = await readFileEntry(entry, { cacheKey });
          found.push(file);
        }
      }
    } catch (e) {
      exitStatus = { error: e.message };
      return;
    }
    // Group by base (prefix__name) to build version stacks
    const grouped = {};
    found.forEach(f => {
      const parsed = parseFilename(f.filename);
      const key = parsed.fullBase;
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

    // On read errors we keep the previous key set; on success refresh presence for missing-file UI
    setFolderPresentKeys(
      unionFolderPresentKeys(
        Object.keys(groupedFinal),
        stateRef.current.cards ?? [],
        stagedSyncCardsRef.current ?? [],
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

    if (stagedRefreshPatches.length > 0) {
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
    const confirmChangesList =
      scanSeq === folderScanSeqRef.current
      && !stagingDragActiveRef.current
        ? buildConfirmChangesForDialog(groupedFinal, canvasNow, stagedNow, {
          suppressedKeys,
          knownAgentChatKeys,
        })
        : [];

    const willClearCanvas = confirmChangesList.length === 0 && replaceCanvas;
    if (refreshPatches.length > 0 && !willClearCanvas) {
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
      if (replaceCanvas) {
        setState(prev => ({ ...prev, cards: [] }));
        setOpenCardId(null);
        setActiveCardId(null);
        setVersionStackOpen(null);
      }
      setTimeout(() => setSyncStatus(null), 2000);
    } else if (scanSeq === folderScanSeqRef.current) {
      setConfirmChanges({
        changes: confirmChangesList,
        applyMode: replaceCanvas ? 'replace' : 'merge',
      });
      exitStatus = null;
    } else {
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
  }, [commitPlacementState, refreshGraph, invalidateFolderScan]);

  const probeFolderStoredOnDevice = useCallback(async (projectId) => {
    if (!projectId) {
      setFolderStoredOnDevice(false);
      return false;
    }
    try {
      const handle = await loadFolderHandle(projectId);
      setFolderStoredOnDevice(Boolean(handle));
      return Boolean(handle);
    } catch {
      setFolderStoredOnDevice(false);
      return false;
    }
  }, []);

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
        setFolderHandle(null);
      } finally {
        if (
          projectId === activeProjectIdRef.current
          && (switchSeq == null || projectSwitchSeqRef.current === switchSeq)
        ) {
          setFolderLinkProbeComplete(true);
        }
      }
    },
    [linkProjectFolder, scanFolder, warnFolderNameMismatch],
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
      setFolderStoredOnDevice(false);
      return;
    }
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
    if (!loaded || !activeProjectId || folderHandle) return;
    if (!folderStoredOnDevice) return;

    const onGesture = () => {
      void attemptRestoreRef.current(
        activeProjectIdRef.current,
        lastLoadedCardsRef.current,
        { requestIfNeeded: true },
      );
    };

    document.addEventListener('pointerdown', onGesture, { once: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', onGesture, { capture: true });
    };
  }, [loaded, activeProjectId, folderHandle, folderStoredOnDevice]);

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

  const pickProjectDirectory = useCallback(async (projectId) => {
    const base = buildDirectoryPickerOptions(projectId);
    try {
      return await window.showDirectoryPicker(base);
    } catch (e) {
      if (base.id && (e?.name === 'TypeError' || e?.name === 'NotSupportedError')) {
        return window.showDirectoryPicker({ mode: 'readwrite' });
      }
      throw e;
    }
  }, []);

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
    try {
      const handle = await pickProjectDirectory(projectId);
      await persistFolderConnection(handle);
      setFolderLinkProbeComplete(true);
      warnFolderNameMismatch(projectId, handle);
      await scanFolder(handle, {
        baseCards: stateRef.current.cards,
        projectId,
        skipPlacementDefer: true,
      });
      folderRestoreHandledSeqRef.current = {
        projectId,
        switchSeq: projectSwitchSeqRef.current,
      };
      await syncCanvasFromServerAfterFolderConnect(projectId);
    } catch (e) {
      if (e.name !== 'AbortError') setSyncStatus({ error: e.message });
    }
  }, [
    scanFolder,
    persistFolderConnection,
    pickProjectDirectory,
    warnFolderNameMismatch,
    syncCanvasFromServerAfterFolderConnect,
  ]);

  const applyFolderHandleAndScan = useCallback(
    async (handle) => {
      const projectId = activeProjectIdRef.current;
      if (projectId && handle) {
        setCachedFolderHandle(projectId, handle);
      }
      setFolderHandle(handle);
      await scanFolder(handle, {
        baseCards: lastLoadedCardsRef.current ?? stateRef.current.cards ?? [],
        projectId,
      });
    },
    [scanFolder],
  );

  const handleReconnectFolder = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || !window.showDirectoryPicker) {
      setSyncStatus({ error: strings.sync.folderUnsupported });
      return;
    }
    try {
      const result = await reconnectFolderForProject(projectId);
      if (result.ok && result.handle) {
        setFolderStoredOnDevice(true);
        warnFolderNameMismatch(projectId, result.handle);
        await loadProjectIntoStateRef.current(projectId, {
          localOnly: true,
          hydratePreviews: false,
        });
        await applyFolderHandleAndScan(result.handle);
        await syncCanvasFromServerAfterFolderConnect(projectId);
        return;
      }
      if (result.reason === 'not_stored') {
        await requestFolder();
        return;
      }
      if (result.reason === 'denied') {
        setSyncStatus({ error: strings.sync.folderPermissionDenied });
        setTimeout(() => setSyncStatus(null), 4000);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setSyncStatus({ error: e.message || strings.sync.folderPermissionDenied });
        setTimeout(() => setSyncStatus(null), 4000);
      }
    }
  }, [
    applyFolderHandleAndScan,
    requestFolder,
    warnFolderNameMismatch,
    syncCanvasFromServerAfterFolderConnect,
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

    // Server-first: footer Sync pulls Postgres layout; folder scan stays on connect/reconnect.
    const withFolderScan = false;
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
    folderLinkProbeComplete,
    scanFolder,
    requestFolder,
    pullActiveProjectFromServer,
    projectList,
    handleReconnectFolder,
  ]);

  const beginChangeFolder = useCallback(async (replaceCanvas) => {
    setChangeFolderDialog(false);
    if (!window.showDirectoryPicker) {
      setSyncStatus({ error: strings.sync.folderUnsupported });
      return;
    }
    try {
      const projectId = activeProjectIdRef.current;
      const handle = await pickProjectDirectory(projectId);
      await persistFolderConnection(handle);
      warnFolderNameMismatch(projectId, handle);
      await scanFolder(
        handle,
        replaceCanvas
          ? {
            baseCards: [],
            replaceCanvas: true,
            projectId,
          }
          : {
            baseCards: stateRef.current.cards,
            projectId,
          },
      );
    } catch (e) {
      if (e.name !== 'AbortError') setSyncStatus({ error: e.message });
    }
  }, [scanFolder, persistFolderConnection, pickProjectDirectory, warnFolderNameMismatch]);

  return {
    persistFolderConnection,
    linkProjectFolder,
    warnFolderNameMismatch,
    scanFolder,
    probeFolderStoredOnDevice,
    attemptRestoreFolderForProject,
    requestFolder,
    pickProjectDirectory,
    applyFolderHandleAndScan,
    handleReconnectFolder,
    handleSyncClick,
    beginChangeFolder,
  };
}

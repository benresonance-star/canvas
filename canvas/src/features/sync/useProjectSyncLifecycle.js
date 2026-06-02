import { useCallback, useEffect, useRef } from 'react';
import {
  loadProjectStructure,
  applyProjectLoadFence,
} from '../../lib/project/loadProjectStructure.js';
import {
  saveProjectById,
  normalizeLoadedProject,
  buildProjectSavePayload,
  commitProjectDocument,
  seedCommittedPayloadFromLoad,
} from '../../lib/persistence.js';
import { auditPlacementStep } from '../../lib/placementAudit.js';
import { patchPlacementsMapFromArrays } from '../../lib/artifactPlacementsMap.js';
import { projectCardCount, parseServerUpdatedAt } from '../../lib/sync/projectSyncMerge.js';
import { getLocalEditAt } from '../../lib/sync/projectSyncRevision.js';
import {
  ensureProjectIndex,
  loadProjectIndex,
  createEmptyProjectState,
  setActiveProjectId as persistActiveProjectId,
  touchActiveProjectInIndex,
  resolveActiveProjectId,
  flushProjectSync,
  runProjectSyncBackground,
  isServerSyncEnabled,
  consumeProjectSyncRecoveryNotice,
  consumeOrphanPurgeNotice,
  consumeServerProjectsSyncedNotice,
  consumeIntegrityGhostNotice,
  consumeDuplicateMergeNotice,
  projectsForMenuFromIndex,
  resolveProjectDisplayName,
  shouldShowOpenInCursorToSync,
  shouldShowDatabaseUnavailable,
  pullProjectDocumentIfServerNewer,
  reconcileProjectDocumentOnSwitch,
  recordGoodLocalCardCount,
  seedClientRevisionFromMeta,
  getClientRevision,
  getProjectConflict,
  clearProjectConflict,
  clearLocalProjectCaches,
  subscribeProjectCacheChanges,
  reconcileActiveProject,
  getProjectSyncMode,
  setProjectDisplayName,
} from '../../lib/projects.js';
import { suppressedKeysForSave, readSuppressedSyncKeys } from '../../lib/syncSuppressedKeys.js';
import {
  runExclusive,
  isBootSyncCompleted,
  markBootSyncCompleted,
  markBootPulledProject,
  wasBootPulledThisSession,
} from '../../lib/projectSyncCoordinator.js';
import { requestActionSync } from '../../lib/actionSync.js';
import { isCanvasInteractionActive } from '../../lib/canvasInteraction.js';
import {
  BOOT_LOADING_TIMEOUT_MS,
  POST_BOOT_SYNC_TIMEOUT_MS,
  withBootTimeout,
  clearSyncingFromServerBanner,
} from '../../lib/bootSync.js';
import { placementMapDiffers } from '../../lib/placementTransfer.js';
import { sanitizeAgentChatProjectState } from '../../lib/canvasCardMerge.js';
import {
  shouldOfferDockRestore,
  countRestorableDockCards,
} from '../../lib/projectDocumentShape.js';
import { shouldApplyProjectLoad } from '../../lib/projectSwitch.js';
import { hydrateStrippedCardContent } from '../../lib/projectHydrate.js';
import {
  hydrateCardsPreviews,
  PREVIEW_HYDRATE_CHUNK_SIZE,
} from '../../lib/previewHydrate.js';
import { unionFolderPresentKeys } from '../../lib/filename.js';
import { shouldAutoFitCanvasOnLoad } from '../../lib/canvasView.js';
import { fetchCanvasProjectMeta } from '../../lib/canvasProjectsApi.js';
import { perfMark, perfMeasure } from '../../lib/loadPerfMarks.js';
import { strings } from '../../content/strings.js';

/**
 * Boot, background sync, project load/switch, and server reconcile lifecycle.
 */
export function useProjectSyncLifecycle({
  refs,
  ui: {
    setLoaded,
    setSyncStatus,
    setSyncLock,
    setState,
    setStagedSyncCards,
    setProjectList,
    setActiveProjectId,
    setProjectSwitchLoading,
    setFolderPresentKeys,
  },
  deps: {
    loaded,
    activeProjectId,
    singleConnectorIdRef,
    folderHandle,
    projectSwitchLoading,
    state,
    fitCanvasViewToCards,
    syncActiveProjectNameFromIndex,
    applyDuplicateNameBanner,
    refreshProjectListFromServer,
    refreshProjectListFromServerRef,
    refreshClusterApiHealth,
    applyClusterContextForProject,
    applyClusterContextForProjectRef,
    flushPendingPlacementTransferSync,
    loadAgentChatThreadIndexEarlyRef,
    agentChatThreadIndexRef,
    activeThreadIdRef,
  },
}) {
  const {
    activeProjectIdRef,
    projectNameDirtyRef,
    stateRef,
    stagedSyncCardsRef,
    folderPresentKeysRef,
    lastLoadedCardsRef,
    userAdjustedViewRef,
    projectHydratedRef,
    switchingProjectRef,
    initialHydratedRef,
    projectSwitchSeqRef,
    bootCompletedRef,
    refreshingFromServerRef,
    lastAppliedSyncLockRef,
    attemptRestoreRef,
    folderRestoreHandledSeqRef,
  } = refs;

  const loadProjectIntoStateRef = useRef(async () => []);
  const applyServerPullResultRef = useRef(async () => null);
  const backgroundSyncStartedRef = useRef(false);

  const loadProjectIntoState = useCallback(async (
    projectId,
    {
      localOnly = false,
      switchSeq,
      document: documentOverride,
      hydratePreviews = true,
    } = {},
  ) => {
    const seqAtStart = switchSeq ?? null;
    let saved;
    if (documentOverride != null) {
      const fenced = await applyProjectLoadFence(projectId, documentOverride);
      saved = fenced ?? documentOverride;
    } else {
      saved = await loadProjectStructure(projectId, { localOnly });
    }
    const base = saved || createEmptyProjectState();
    const normalized = normalizeLoadedProject(base);
    const cardsForSanitize = normalized.cards;
    const stagedForSanitize = normalized.stagedSyncCards;
    const preferredCardId = agentChatThreadIndexRef.current.threads.find(
      (t) => t.threadId === activeThreadIdRef.current,
    )?.cardId;
    const suppressedKeys = readSuppressedSyncKeys(projectId, normalized);
    const sanitized = sanitizeAgentChatProjectState(
      cardsForSanitize,
      stagedForSanitize,
      {
        connectorId: singleConnectorIdRef.current,
        preferredCardId,
        suppressedKeys,
        threads: agentChatThreadIndexRef.current?.threads ?? [],
      },
    );
    let rawCards = sanitized.cards;
    if (folderHandle && folderPresentKeysRef.current?.length) {
      rawCards = await hydrateStrippedCardContent(rawCards, {
        folderHandle,
        folderPresentKeys: folderPresentKeysRef.current,
      });
    }
    const stagedRaw = sanitized.stagedSyncCards;
    const patchedPlacements = patchPlacementsMapFromArrays(
      normalized.artifactPlacements ?? {},
      sanitized.cards,
      sanitized.stagedSyncCards,
    );
    const placementChangedBySanitize = placementMapDiffers(
      normalized.artifactPlacements,
      patchedPlacements,
    );
    const cleanedPersist =
      rawCards.length !== (normalized.cards ?? []).length
      || stagedRaw.length !== (normalized.stagedSyncCards ?? []).length
      || sanitized.keysMigrated;
    const hydrateOpts = {
      localOnly,
      chunkSize: hydratePreviews && localOnly ? PREVIEW_HYDRATE_CHUNK_SIZE : 0,
    };
    let cards = hydratePreviews
      ? await hydrateCardsPreviews(rawCards, hydrateOpts)
      : rawCards;
    let stagedHydrated =
      hydratePreviews && stagedRaw.length > 0
        ? await hydrateCardsPreviews(stagedRaw, hydrateOpts)
        : stagedRaw;
    const seqNow = switchSeq != null ? projectSwitchSeqRef.current : null;
    if (
      !shouldApplyProjectLoad(
        projectId,
        activeProjectIdRef.current,
        seqAtStart,
        seqNow,
      )
    ) {
      return null;
    }
    lastLoadedCardsRef.current = cards;
    projectHydratedRef.current.add(projectId);
    recordGoodLocalCardCount(projectId, cards.length);
    const { stagedSyncCards: _staged, ...stateWithoutStaged } = normalized;
    const indexForName = await loadProjectIndex();
    const displayName = resolveProjectDisplayName(
      indexForName,
      projectId,
      strings.defaultProjectName,
    );
    const mergedProjectName = projectNameDirtyRef.current
      ? stateRef.current.projectName
      : displayName;
    stateRef.current = {
      ...stateRef.current,
      ...stateWithoutStaged,
      artifactPlacements: patchedPlacements,
      cards,
      projectName: mergedProjectName,
    };
    stagedSyncCardsRef.current = stagedHydrated;
    setState((prev) => ({
      ...stateWithoutStaged,
      artifactPlacements: patchedPlacements,
      cards,
      projectName: projectNameDirtyRef.current ? prev.projectName : displayName,
    }));
    setStagedSyncCards(stagedHydrated);
    if (folderHandle) {
      setFolderPresentKeys((prev) =>
        unionFolderPresentKeys(prev ?? [], cards, stagedHydrated),
      );
    }
    if (!projectNameDirtyRef.current) {
      syncActiveProjectNameFromIndex(indexForName);
    }
    const dockDoc = { cards, stagedSyncCards: stagedHydrated };
    if (shouldOfferDockRestore(dockDoc, suppressedKeys)) {
      const dockCount = countRestorableDockCards(dockDoc, suppressedKeys);
      setSyncStatus((prev) => ({
        ...(prev ?? {}),
        dockRestore: { count: dockCount },
      }));
    } else if (projectId === activeProjectIdRef.current) {
      setSyncStatus((prev) => {
        if (!prev?.dockRestore) return prev;
        const { dockRestore: _removed, ...rest } = prev;
        return Object.keys(rest).length > 0 ? rest : null;
      });
    }
    if (
      cleanedPersist
      && !placementChangedBySanitize
      && !switchingProjectRef.current
      && initialHydratedRef.current
    ) {
      void saveProjectById(
        projectId,
        { ...stateWithoutStaged, artifactPlacements: patchedPlacements, cards },
        stagedHydrated,
        { pushRemote: true },
      );
    }
    if (projectId && isServerSyncEnabled()) {
      void seedClientRevisionFromMeta(projectId);
    }
    seedCommittedPayloadFromLoad(
      projectId,
      buildProjectSavePayload(
        {
          ...stateWithoutStaged,
          projectName: mergedProjectName,
          cards,
          artifactPlacements: patchedPlacements,
          canvasView:
            stateWithoutStaged.canvasView ?? { x: 0, y: 0, zoom: 1 },
        },
        stagedHydrated,
        suppressedKeys,
        { authoritativePlacements: patchedPlacements },
      ),
    );
    auditPlacementStep('load:projectIntoState', {
      cards,
      stagedSyncCards: stagedHydrated,
      artifactPlacements: patchedPlacements,
    }, { projectId });
    return cards;
  }, [folderHandle, syncActiveProjectNameFromIndex]);

  const applyServerPullResult = useCallback(
    async (
      projectId,
      { pulled, payload, localCacheWritten },
      { showToast = false, hydratePreviews = true, allowFit = false } = {},
    ) => {
      if (!pulled || !payload || !projectId) return null;
      if (isCanvasInteractionActive()) return null;
      if (!projectNameDirtyRef.current) {
        const idx = await loadProjectIndex();
        syncActiveProjectNameFromIndex(idx);
      }
      const fencedPayload = await applyProjectLoadFence(projectId, payload);
      const documentToLoad = normalizeLoadedProject(fencedPayload ?? payload);
      const cards = await loadProjectIntoStateRef.current(projectId, {
        localOnly: true,
        document: documentToLoad,
        hydratePreviews,
      });
      if (cards != null && allowFit && !userAdjustedViewRef.current) {
        fitCanvasViewToCards(cards);
      }
      if (!localCacheWritten) {
        setSyncStatus({
          banner:
            strings.projects.localStorageFull
            + strings.projects.projectIdHint(projectId),
        });
      } else if (showToast) {
        setSyncStatus({ toast: strings.projects.syncedFromServer });
        setTimeout(() => setSyncStatus(null), 4000);
      }
      return cards;
    },
    [fitCanvasViewToCards, syncActiveProjectNameFromIndex],
  );

  const clearStaleSyncBanners = useCallback((prev) => {
    if (
      prev?.banner === strings.projects.serverRevisionStale
      || prev?.banner === strings.projects.remoteChangesWhileEditing
    ) {
      return null;
    }
    return prev;
  }, []);

  const applyReconcileFromServer = useCallback(async (projectId, { showPullToast = false } = {}) => {
    const id = projectId ?? activeProjectIdRef.current;
    if (!id || !isServerSyncEnabled()) {
      if (lastAppliedSyncLockRef.current !== 'live') {
        lastAppliedSyncLockRef.current = 'live';
        setSyncLock('live');
        setSyncStatus(clearStaleSyncBanners);
      }
      return { lock: 'live', serverRevision: 0, action: 'none' };
    }
    if (isCanvasInteractionActive()) {
      return { lock: 'live', serverRevision: 0, action: 'none' };
    }
    const result = await reconcileActiveProject(id);
    if (id !== activeProjectIdRef.current) return result;
    if (result.pulled && result.payload) {
      await applyServerPullResult(
        id,
        {
          pulled: true,
          payload: result.payload,
          localCacheWritten: result.localCacheWritten ?? true,
        },
        { showToast: showPullToast, hydratePreviews: true },
      );
    }
    return result;
  }, [applyServerPullResult, clearStaleSyncBanners]);

  const handleRefreshFromServer = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || !isServerSyncEnabled()) return;
    refreshingFromServerRef.current = true;
    try {
      await runExclusive('refresh', async () => {
        await flushProjectSync();
        await applyReconcileFromServer(projectId, { showPullToast: true });
        const pullResult = await pullProjectDocumentIfServerNewer(projectId, {
          force: true,
        });
        if (pullResult.pulled) {
          await applyServerPullResult(projectId, pullResult, {
            showToast: true,
            hydratePreviews: true,
          });
        }
      });
    } finally {
      refreshingFromServerRef.current = false;
    }
  }, [applyReconcileFromServer, applyServerPullResult]);

  const resolveProjectConflictUseServer = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    const conflict = getProjectConflict(projectId);
    if (!conflict?.server) {
      await handleRefreshFromServer();
      return;
    }
    clearProjectConflict(projectId);
    await applyServerPullResult(
      projectId,
      {
        pulled: true,
        payload: conflict.server,
        localCacheWritten: true,
      },
      { showToast: true, hydratePreviews: true },
    );
    setSyncLock('live');
    setSyncStatus(null);
  }, [applyServerPullResult, handleRefreshFromServer]);

  const resolveProjectConflictKeepLocal = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    const conflict = getProjectConflict(projectId);
    clearProjectConflict(projectId);

    const localPayload =
      conflict?.local
      ?? buildProjectSavePayload(
        stateRef.current,
        stagedSyncCardsRef.current,
        suppressedKeysForSave(projectId, stateRef.current),
      );

    const commitResult = await commitProjectDocument(projectId, {
      state: {
        ...stateRef.current,
        cards: localPayload.cards ?? stateRef.current.cards,
        canvasView: localPayload.canvasView ?? stateRef.current.canvasView,
        artifactPlacements: localPayload.artifactPlacements,
        projectName: localPayload.projectName ?? stateRef.current.projectName,
        suppressedSyncKeys: localPayload.suppressedSyncKeys,
      },
      stagedSyncCards: localPayload.stagedSyncCards ?? stagedSyncCardsRef.current,
      suppressedSyncKeys:
        localPayload.suppressedSyncKeys
        ?? suppressedKeysForSave(projectId, stateRef.current),
      reason: 'conflict-keep-local',
      pushRemote: true,
    });
    if (commitResult.pushOk) {
      setSyncLock('live');
      setSyncStatus(null);
    }
  }, []);

  useEffect(() => {
    applyServerPullResultRef.current = applyServerPullResult;
  }, [applyServerPullResult]);

  const handleClearLocalCache = useCallback(async () => {
    if (!isServerSyncEnabled()) {
      setSyncStatus({ banner: strings.projects.clearLocalCacheUnavailable });
      return;
    }
    const projectId = activeProjectIdRef.current;
    clearLocalProjectCaches({ activeProjectId: projectId, keepActive: false });
    setSyncStatus({ toast: strings.projects.clearLocalCacheDone });
    if (projectId) {
      const pullResult = await pullProjectDocumentIfServerNewer(projectId, {
        force: true,
      });
      if (pullResult.pulled) {
        await applyServerPullResult(projectId, pullResult, { allowFit: false });
      } else {
        await loadProjectIntoState(projectId, { hydratePreviews: true });
      }
    }
    setTimeout(() => setSyncStatus(null), 6000);
  }, [applyServerPullResult, loadProjectIntoState]);

  useEffect(() => {
    if (!loaded) return undefined;
    return subscribeProjectCacheChanges((projectId) => {
      if (projectId !== activeProjectIdRef.current) return;
      if (isCanvasInteractionActive()) return;
      void runExclusive('cache-tab', async () => {
        await applyReconcileFromServer(projectId, { showPullToast: true });
        if (!isCanvasInteractionActive()) {
          await loadProjectIntoStateRef.current(projectId, { localOnly: true });
        }
      }, { mode: 'skip' });
    });
  }, [loaded, applyReconcileFromServer]);

  useEffect(() => {
    loadProjectIntoStateRef.current = loadProjectIntoState;
  }, [loadProjectIntoState]);

  const flushOutgoingProjectToServer = useCallback(
    async (projectId, state, stagedSyncCards, { artifactPlacements = null } = {}) => {
      if (!projectId || !isServerSyncEnabled()) {
        return { pushOk: true, pushResult: { ok: true, skipped: true } };
      }
      perfMark('switch/flush-out-start');
      const commitResult = await commitProjectDocument(projectId, {
        state,
        stagedSyncCards,
        artifactPlacements,
        suppressedSyncKeys: suppressedKeysForSave(projectId, state),
        stripNoteContent:
          Boolean(folderHandle)
          && Boolean(folderPresentKeysRef.current?.length)
          && isServerSyncEnabled(),
        reason: 'projectSwitch:flush',
        pushRemote: true,
      });
      await setProjectDisplayName(projectId, state.projectName);
      await flushProjectSync();
      perfMark('switch/flush-out-end');
      perfMeasure(
        'switch/flush-out',
        'switch/flush-out-start',
        'switch/flush-out-end',
      );
      const pushOk = Boolean(commitResult.pushOk);
      return {
        pushOk,
        pushResult: { ok: pushOk, skipped: !pushOk },
      };
    },
    [folderHandle],
  );

  const finishBootUi = useCallback(() => {
    setLoaded(true);
    setProjectSwitchLoading(false);
  }, []);

  // Load saved state (once per mount — do not re-run when cluster callbacks change)
  useEffect(() => {
    if (bootCompletedRef.current) {
      initialHydratedRef.current = true;
      finishBootUi();
      clearSyncingFromServerBanner(setSyncStatus);
      return undefined;
    }
    let cancelled = false;
    let bootUiShown = false;
    const revealBootUi = () => {
      if (bootUiShown) return;
      bootUiShown = true;
      initialHydratedRef.current = true;
      finishBootUi();
      flushPendingPlacementTransferSync();
    };

    (async () => {
      try {
        await withBootTimeout(
          (async () => {
            const index = await ensureProjectIndex();
            if (cancelled) return;
            const activeId =
              index.activeProjectId ?? resolveActiveProjectId(index);
            activeProjectIdRef.current = activeId;
            setActiveProjectId(activeId);
            setProjectList(projectsForMenuFromIndex(index));
            if (activeId) {
              await persistActiveProjectId(activeId);
            }
            if (cancelled) return;
            perfMark('boot/local');
            if (activeId) {
              await loadAgentChatThreadIndexEarlyRef.current(
                activeId,
                singleConnectorIdRef.current,
              );
              await loadProjectIntoStateRef.current(activeId, {
                localOnly: true,
                hydratePreviews: false,
              });
              if (
                (lastLoadedCardsRef.current?.length ?? 0) === 0
                && index?.projects?.length
              ) {
                const { findBestProjectIdWithLocalCanvas } = await import(
                  '../../lib/projects.js'
                );
                const richerId = await findBestProjectIdWithLocalCanvas(index);
                if (richerId && richerId !== activeId) {
                  activeProjectIdRef.current = richerId;
                  setActiveProjectId(richerId);
                  await persistActiveProjectId(richerId);
                  await loadAgentChatThreadIndexEarlyRef.current(
                    richerId,
                    singleConnectorIdRef.current,
                  );
                  await loadProjectIntoStateRef.current(richerId, {
                    localOnly: true,
                    hydratePreviews: false,
                  });
                }
              }
            } else {
              setState((prev) => ({
                ...prev,
                cards: [],
                projectName: strings.defaultProjectName,
              }));
            }
            perfMark('boot/local-done');
            perfMeasure('boot/local', 'boot/local', 'boot/local-done');
          })(),
          BOOT_LOADING_TIMEOUT_MS,
        );
        if (cancelled) return;
        revealBootUi();
        markBootSyncCompleted();
        const orphanPurged = consumeOrphanPurgeNotice();
        if (orphanPurged > 0) {
          setSyncStatus({
            toast: strings.projects.purgedOrphanCaches(orphanPurged),
          });
          setTimeout(() => setSyncStatus(null), 6000);
        }
        const serverSynced = consumeServerProjectsSyncedNotice();
        if (serverSynced > 0) {
          const refreshed = await loadProjectIndex();
          if (refreshed?.projects) {
            setProjectList(projectsForMenuFromIndex(refreshed));
            applyDuplicateNameBanner(refreshed);
          }
          setSyncStatus({
            toast: strings.projects.syncedFromServer(serverSynced),
          });
          setTimeout(() => setSyncStatus(null), 6000);
        }
        const duplicatesMerged = consumeDuplicateMergeNotice();
        if (duplicatesMerged > 0) {
          const refreshed = await loadProjectIndex();
          if (refreshed?.projects) setProjectList(projectsForMenuFromIndex(refreshed));
          setSyncStatus({
            toast: strings.projects.mergedDuplicates(duplicatesMerged),
          });
          setTimeout(() => setSyncStatus(null), 6000);
        }
        const missingBody = consumeIntegrityGhostNotice();
        if (missingBody > 0) {
          setSyncStatus({
            toast: strings.projects.projectsMissingBody(missingBody),
          });
          setTimeout(() => setSyncStatus(null), 8000);
        }
        if (shouldShowDatabaseUnavailable()) {
          setSyncStatus({ banner: strings.projects.databaseUnavailable });
        } else if (getProjectSyncMode() === 'local-only') {
          setSyncStatus({ banner: strings.projects.localOnlyBanner });
        } else if (shouldShowOpenInCursorToSync()) {
          setSyncStatus({ banner: strings.projects.openInCursorToSync });
        }
      } catch (e) {
        if (e?.code === 'BOOT_TIMEOUT') {
          console.warn('Canvas local boot timed out');
          if (!cancelled) {
            setSyncStatus({ banner: strings.projects.bootSyncTimeout });
          }
        } else {
          console.error('Canvas boot failed:', e);
          if (!cancelled) {
            setSyncStatus({ banner: strings.projects.loadFailed });
          }
        }
        if (!cancelled) revealBootUi();
      } finally {
        if (!cancelled) {
          bootCompletedRef.current = true;
          initialHydratedRef.current = true;
          revealBootUi();
          flushPendingPlacementTransferSync();
        }
      }

      if (cancelled) return;
      const activeId = activeProjectIdRef.current;
      try {
        await withBootTimeout(
          runExclusive('boot', async () => {
            if (activeId && isServerSyncEnabled()) {
              setSyncStatus((prev) =>
                prev?.banner ? prev : { banner: strings.projects.syncingFromServer },
              );
              let pullResult = {
                pulled: false,
                payload: null,
                localCacheWritten: true,
              };
              try {
                const { mergeProjectDocuments } = await import(
                  '../../lib/projectDocumentMerge.js'
                );
                const localSaved = await loadProjectStructure(activeId, {
                  localOnly: true,
                });
                const localDoc = localSaved
                  ? normalizeLoadedProject(localSaved)
                  : null;
                const localCanvasCount = projectCardCount(localDoc);
                let remote = null;
                if (localCanvasCount === 0) {
                  const { fetchCanvasProjectDocument } = await import(
                    '../../lib/canvasProjectsApi.js'
                  );
                  remote = await fetchCanvasProjectDocument(activeId);
                }
                const localEditAt = getLocalEditAt(activeId) ?? 0;
                const serverAt = remote?.updatedAt
                  ? parseServerUpdatedAt(remote.updatedAt)
                  : 0;
                const { decision } = mergeProjectDocuments(
                  localDoc,
                  remote?.payload ?? null,
                  {
                    localEditAt,
                    serverAt,
                    projectId: activeId,
                    placementSource: localDoc,
                    reason: 'boot',
                  },
                );
                const keepLocalLayout =
                  !remote?.payload || decision === 'keptLocal';

                if (localDoc) {
                  const authoritativePlacements = patchPlacementsMapFromArrays(
                    localDoc.artifactPlacements ?? {},
                    localDoc.cards ?? [],
                    localDoc.stagedSyncCards ?? [],
                  );
                  const shouldPush =
                    !remote?.payload
                    || keepLocalLayout
                    || placementMapDiffers(
                      authoritativePlacements,
                      remote.payload.artifactPlacements,
                    );
                  if (shouldPush) {
                    await commitProjectDocument(activeId, {
                      state: {
                        ...stateRef.current,
                        cards: localDoc.cards ?? [],
                        canvasView: localDoc.canvasView ?? stateRef.current.canvasView,
                        artifactPlacements: authoritativePlacements,
                      },
                      stagedSyncCards: localDoc.stagedSyncCards ?? [],
                      suppressedSyncKeys: suppressedKeysForSave(activeId, stateRef.current),
                      stripNoteContent:
                        Boolean(folderHandle)
                        && Boolean(folderPresentKeysRef.current?.length),
                      artifactPlacements: authoritativePlacements,
                      reason: 'boot-push',
                      pushRemote: true,
                    });
                  }
                }

                if (!keepLocalLayout) {
                  pullResult = await pullProjectDocumentIfServerNewer(activeId, {
                    force: true,
                  });
                }
              } catch {
                /* best effort — keep local paint from IDB */
              }
              perfMark('boot/server-pull');
              if (cancelled) return;
              if (pullResult.pulled) {
                markBootPulledProject();
                await applyServerPullResultRef.current(activeId, pullResult, {
                  hydratePreviews: false,
                  allowFit: true,
                });
              }
              perfMark('boot/server-pull-done');
              perfMeasure(
                'boot/server-pull',
                'boot/server-pull',
                'boot/server-pull-done',
              );
              void requestActionSync('boot', { projectId: activeId });
            }
            if (cancelled) return;
            await refreshProjectListFromServerRef.current({
              reconcileScope: 'active',
              activeProjectId: activeId,
            });
            await touchActiveProjectInIndex(activeId);
          }),
          POST_BOOT_SYNC_TIMEOUT_MS,
        );
      } catch (e) {
        if (e?.code === 'BOOT_TIMEOUT') {
          console.warn('Canvas post-boot sync timed out (background)');
        } else {
          console.error('Canvas post-boot sync failed:', e);
          if (!cancelled) {
            setSyncStatus((prev) =>
              prev?.banner === strings.projects.localStorageFull
                ? prev
                : { banner: strings.projects.loadFailed },
            );
          }
        }
      } finally {
        clearSyncingFromServerBanner(setSyncStatus);
        if (!cancelled) {
          markBootSyncCompleted();
        }
      }
    })();
    return () => {
      cancelled = true;
      revealBootUi();
      setProjectSwitchLoading(false);
      clearSyncingFromServerBanner(setSyncStatus);
    };
  }, [finishBootUi]);

  // Background project + preview sync after UI is visible
  useEffect(() => {
    if (!loaded || !isBootSyncCompleted() || backgroundSyncStartedRef.current) {
      return undefined;
    }
    backgroundSyncStartedRef.current = true;
    let cancelled = false;
    const projectId = activeProjectId;
    (async () => {
      try {
        await runExclusive('background', async () => {
          let serverPulled = wasBootPulledThisSession();
          if (projectId && isServerSyncEnabled() && !serverPulled) {
            const localSnapshot = await loadProjectStructure(projectId, {
              localOnly: true,
            });
            const localCanvasCount = projectCardCount(localSnapshot);
            if (localCanvasCount === 0) {
              const pullResult = await pullProjectDocumentIfServerNewer(projectId);
              if (cancelled) return;
              if (pullResult.pulled) {
                serverPulled = true;
                await applyServerPullResult(projectId, pullResult, {
                  hydratePreviews: false,
                });
                if (cancelled) return;
              }
            }
          }
          await runProjectSyncBackground();
          const syncedCount = consumeProjectSyncRecoveryNotice();
          if (!cancelled) {
            await refreshProjectListFromServer({
              reconcileScope: 'active',
              activeProjectId: projectId,
            });
          }
          if (!cancelled && syncedCount > 0) {
            setSyncStatus({
              toast: strings.projects.recoveredFromBrowser(syncedCount),
            });
            setTimeout(() => setSyncStatus(null), 6000);
          }
          if (cancelled || !projectId) return;

          perfMark('background/hydrate-start');
          const saved = await loadProjectStructure(projectId, { localOnly: true });
          if (cancelled) return;
          const base = saved || createEmptyProjectState();
          const normalized = normalizeLoadedProject(base);
          const preferredCardId = agentChatThreadIndexRef.current.threads.find(
            (t) => t.threadId === activeThreadIdRef.current,
          )?.cardId;
          const sanitized = sanitizeAgentChatProjectState(
            normalized.cards,
            normalized.stagedSyncCards,
            {
              connectorId: singleConnectorIdRef.current,
              preferredCardId,
              suppressedKeys: readSuppressedSyncKeys(projectId, normalized),
              threads: agentChatThreadIndexRef.current?.threads ?? [],
            },
          );
          const remoteCards = await hydrateCardsPreviews(sanitized.cards, {
            localOnly: true,
            chunkSize: PREVIEW_HYDRATE_CHUNK_SIZE,
          });
          perfMark('background/hydrate-end');
          perfMeasure(
            'background/hydrate',
            'background/hydrate-start',
            'background/hydrate-end',
          );
          const patchedPlacements = patchPlacementsMapFromArrays(
            normalized.artifactPlacements ?? {},
            sanitized.cards,
            sanitized.stagedSyncCards,
          );
          const placementChangedBySanitize = placementMapDiffers(
            normalized.artifactPlacements,
            patchedPlacements,
          );
          const stagedChanged =
            sanitized.cards.length !== (normalized.cards ?? []).length
            || sanitized.stagedSyncCards.length !== (normalized.stagedSyncCards ?? []).length
            || sanitized.keysMigrated;
          if (stagedChanged && !placementChangedBySanitize) {
            const { stagedSyncCards: _s, cards: _c, ...rest } = normalized;
            void saveProjectById(
              projectId,
              { ...rest, artifactPlacements: patchedPlacements, cards: sanitized.cards },
              sanitized.stagedSyncCards,
              { pushRemote: true },
            );
          }
          if (cancelled) return;

          const { stagedSyncCards: _staged, cards: _cards, ...stateFields } = normalized;
          const previewById = new Map(remoteCards.map((c) => [c.id, c]));
          if (!cancelled) {
            setStagedSyncCards((prev) => {
              if (activeProjectIdRef.current !== projectId) return prev;
              const stagedPreviewByKey = new Map(
                (sanitized.stagedSyncCards ?? []).map((s) => [
                  s.stagingId ?? s.key,
                  s,
                ]),
              );
              return prev.map((row) => {
                const hydrated = stagedPreviewByKey.get(row.stagingId ?? row.key);
                return hydrated ? { ...row, versions: hydrated.versions } : row;
              });
            });
          }
          setState((prev) => {
            if (activeProjectIdRef.current !== projectId) return prev;
            const prevCards = prev.cards ?? [];
            const loadedCount = sanitized.cards?.length ?? 0;
            const prevCount = prevCards.length;
            const adoptLoadedCanvas =
              loadedCount > prevCount
              || (loadedCount > 0 && prevCount === 0);
            const cardsSource = adoptLoadedCanvas ? sanitized.cards : prevCards;
            return {
              ...prev,
              canvasView: stateFields.canvasView ?? prev.canvasView,
              cards: cardsSource.map((c) => {
                const hydrated = previewById.get(c.id);
                return hydrated ? { ...c, versions: hydrated.versions } : c;
              }),
            };
          });
          if (!cancelled) {
            setStagedSyncCards((prev) => {
              if (activeProjectIdRef.current !== projectId) return prev;
              const loadedCount = sanitized.cards?.length ?? 0;
              const prevCanvasCount = stateRef.current.cards?.length ?? 0;
              if (
                loadedCount <= prevCanvasCount
                && prevCanvasCount > 0
              ) {
                return prev;
              }
              if (loadedCount > prevCanvasCount || prevCanvasCount === 0) {
                return sanitized.stagedSyncCards ?? prev;
              }
              return prev;
            });
          }

          if (!cancelled) await refreshClusterApiHealth();
          await applyClusterContextForProjectRef.current(
            projectId,
            stateRef.current.projectName,
          );
          if (!cancelled) {
            const refreshedIndex = await refreshProjectListFromServer({
              reconcileScope: 'all',
              activeProjectId: projectId,
            });
            if (refreshedIndex) {
              syncActiveProjectNameFromIndex(refreshedIndex);
            }
          }
        });
      } catch (e) {
        console.error('Background canvas sync failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    loaded,
    activeProjectId,
    refreshProjectListFromServer,
    applyServerPullResult,
    refreshClusterApiHealth,
    syncActiveProjectNameFromIndex,
  ]);

  const persistProjectDisplayName = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId || !projectNameDirtyRef.current) return;
    const name = stateRef.current.projectName?.trim();
    if (!name) return;
    await setProjectDisplayName(projectId, name);
    const index = await loadProjectIndex();
    if (index?.projects) setProjectList(projectsForMenuFromIndex(index));
  }, []);

  const commitProjectDisplayName = useCallback(async () => {
    if (!projectNameDirtyRef.current) return;
    await persistProjectDisplayName();
    projectNameDirtyRef.current = false;
  }, [persistProjectDisplayName]);

  useEffect(() => {
    if (!loaded || !activeProjectId || switchingProjectRef.current || !initialHydratedRef.current) {
      return undefined;
    }
    if (!projectNameDirtyRef.current) return undefined;
    const timer = setTimeout(() => {
      void persistProjectDisplayName();
    }, 600);
    return () => clearTimeout(timer);
  }, [state.projectName, loaded, activeProjectId, persistProjectDisplayName]);

  const continueProjectSwitchBackground = useCallback(
    async (targetId, switchSeq, outgoing = null) => {
      const stillActive = () =>
        activeProjectIdRef.current === targetId
        && projectSwitchSeqRef.current === switchSeq;

      try {
        const outgoingId = outgoing?.projectId;
        if (
          outgoingId
          && outgoingId !== targetId
          && outgoing.state
        ) {
          const flushResult = await runExclusive('switch-flush', async () =>
            flushOutgoingProjectToServer(
              outgoingId,
              outgoing.state,
              outgoing.stagedSyncCards ?? [],
              { artifactPlacements: outgoing.artifactPlacements ?? null },
            ),
          );
          if (
            flushResult
            && !flushResult.pushOk
            && flushResult.pushResult
            && !flushResult.pushResult.skipped
            && (outgoing.state.cards?.length ?? 0) > 0
          ) {
            setSyncStatus({ toast: strings.projects.switchPushFailed });
            setTimeout(() => setSyncStatus(null), 6000);
          }
          const refreshed = await loadProjectIndex();
          if (refreshed?.projects) {
            setProjectList(projectsForMenuFromIndex(refreshed));
          }
        }

        let serverPulled = false;
        if (isServerSyncEnabled()) {
          const pullResult = await reconcileProjectDocumentOnSwitch(targetId);
          if (!stillActive()) return;
          if (pullResult.pulled) {
            serverPulled = true;
            const pulledCards = await loadProjectIntoStateRef.current(targetId, {
              switchSeq,
              localOnly: true,
              document: pullResult.localCacheWritten
                ? undefined
                : pullResult.payload,
              hydratePreviews: true,
            });
            if (!stillActive()) return;
            if (!projectNameDirtyRef.current) {
              const idx = await loadProjectIndex();
              syncActiveProjectNameFromIndex(idx);
            }
            if (
              pulledCards != null
              && shouldAutoFitCanvasOnLoad(
                stateRef.current.canvasView,
                pulledCards,
              )
            ) {
              fitCanvasViewToCards(pulledCards);
            }
            if (!pullResult.localCacheWritten) {
              setSyncStatus({
                banner:
                  strings.projects.localStorageFull
                  + strings.projects.projectIdHint(targetId),
              });
            } else if (stillActive()) {
              await applyReconcileFromServer(targetId);
            }
          } else if (stillActive()) {
            await applyReconcileFromServer(targetId);
          }
        }

        if (!stillActive()) return;
        if (!serverPulled) {
          let hydrated = await loadProjectIntoStateRef.current(targetId, {
            switchSeq,
            localOnly: true,
            hydratePreviews: true,
          });
          if (
            !stillActive()
          ) {
            return;
          }
          if (
            (hydrated == null || hydrated.length === 0)
            && isServerSyncEnabled()
          ) {
            const cacheMissPull = await pullProjectDocumentIfServerNewer(targetId, {
              force: true,
            });
            if (!stillActive()) return;
            if (cacheMissPull.pulled) {
              hydrated = await loadProjectIntoStateRef.current(targetId, {
                switchSeq,
                localOnly: true,
                document: cacheMissPull.payload ?? undefined,
                hydratePreviews: true,
              });
            }
          }
          if (!stillActive()) return;
          if (
            hydrated != null
            && shouldAutoFitCanvasOnLoad(stateRef.current.canvasView, hydrated)
          ) {
            fitCanvasViewToCards(hydrated);
          }
        }

        perfMark('switch/background-done');
        perfMeasure('switch/background', 'switch/start', 'switch/background-done');

        await applyClusterContextForProjectRef.current(
          targetId,
          stateRef.current.projectName,
        );
        if (!stillActive()) return;

        await touchActiveProjectInIndex(targetId);
        void refreshProjectListFromServer({
          reconcileScope: 'none',
          activeProjectId: targetId,
        });
        const refreshedIndex = await loadProjectIndex();
        if (stillActive()) {
          syncActiveProjectNameFromIndex(refreshedIndex);
        }
      } catch (e) {
        console.error('Project switch background sync failed:', e);
      } finally {
        if (stillActive()) {
          await applyReconcileFromServer(targetId);
          const handled = folderRestoreHandledSeqRef.current;
          if (
            handled?.projectId !== targetId
            || handled?.switchSeq !== switchSeq
          ) {
            void attemptRestoreRef.current(targetId, lastLoadedCardsRef.current, {
              requestIfNeeded: false,
            });
          }
        }
      }
    },
    [
      refreshProjectListFromServer,
      syncActiveProjectNameFromIndex,
      fitCanvasViewToCards,
      applyReconcileFromServer,
      flushOutgoingProjectToServer,
    ],
  );

  /** Pull server project into this tab (no local flush first — safe for cross-browser refresh). */
  const pullActiveProjectFromServer = useCallback(
    async ({ showToast = true } = {}) => {
      const projectId = activeProjectIdRef.current;
      if (!projectId || !isServerSyncEnabled()) {
        return { pulled: false, revision: null, missingServerDocument: false };
      }
      let missingServerDocument = false;
      try {
        const meta = await fetchCanvasProjectMeta(projectId);
        missingServerDocument = !meta || (meta.revision ?? 0) <= 0;
      } catch {
        missingServerDocument = true;
      }

      let pulled = false;
      const pullResult = await pullProjectDocumentIfServerNewer(projectId, { force: true });
      if (pullResult.pulled) {
        await applyServerPullResult(projectId, pullResult, {
          showToast,
          hydratePreviews: true,
        });
        pulled = true;
        missingServerDocument = false;
      }
      const reconcile = await applyReconcileFromServer(projectId, {
        showPullToast: showToast,
      });
      const didPull = pulled || Boolean(reconcile.pulled);
      const revision = getClientRevision(projectId);
      return {
        pulled: didPull,
        revision: revision > 0 ? revision : null,
        missingServerDocument: missingServerDocument && !didPull,
      };
    },
    [applyServerPullResult, applyReconcileFromServer],
  );

  /** Merge server canvas after this browser links a folder (other tabs already pushed layout). */
  const syncCanvasFromServerAfterFolderConnect = useCallback(
    async (projectId) => {
      const id = projectId ?? activeProjectIdRef.current;
      if (!id || !isServerSyncEnabled()) return;
      try {
        await runExclusive('post-folder-connect', async () => {
          await applyReconcileFromServer(id);
          const hasCanvasCards = (stateRef.current.cards?.length ?? 0) > 0;
          if (!hasCanvasCards) {
            const pullResult = await pullProjectDocumentIfServerNewer(id, { force: true });
            if (pullResult.pulled) {
              await applyServerPullResult(id, pullResult, {
                hydratePreviews: true,
                allowFit: true,
              });
            }
          }
        });
      } catch (e) {
        console.warn('Post folder-connect server sync failed:', e);
      }
    },
    [applyReconcileFromServer, applyServerPullResult],
  );

  return {
    applyServerPullResult,
    applyReconcileFromServer,
    handleRefreshFromServer,
    resolveProjectConflictUseServer,
    resolveProjectConflictKeepLocal,
    loadProjectIntoState,
    loadProjectIntoStateRef,
    handleClearLocalCache,
    flushOutgoingProjectToServer,
    finishBootUi,
    continueProjectSwitchBackground,
    pullActiveProjectFromServer,
    syncCanvasFromServerAfterFolderConnect,
    persistProjectDisplayName,
    commitProjectDisplayName,
    applyServerPullResultRef,
    backgroundSyncStartedRef,
  };
}

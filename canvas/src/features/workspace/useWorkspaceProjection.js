import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  loadProjectIndex,
  setActiveProjectId as persistActiveProjectId,
  isServerSyncEnabled,
  findBestProjectIdWithLocalCanvas,
  projectsForMenuFromIndex,
  reconcileProjectDocumentOnSwitch,
} from '../../lib/projects.js';
import {
  commitProjectDocument,
  clearCommittedPayloadCache,
  getCommittedPayload,
} from '../../lib/persistence.js';
import { patchPlacementsMapFromArrays } from '../../lib/artifactPlacementsMap.js';
import { suppressedKeysForSave } from '../../lib/syncSuppressedKeys.js';
import {
  buildSwitchPlaceholderState,
  buildProjectSwitchCommitPlan,
  shouldSkipProjectSwitch,
  shouldRetrySwitchLoad,
  withSwitchPaintTimeout,
} from '../../lib/projectSwitch.js';
import { perfMark, perfMeasure } from '../../lib/loadPerfMarks.js';
import { resolveProjectDisplayName } from '../../lib/projectDisplayName.js';
import { pullProjectDocumentIfServerNewer } from '../../lib/projectSync.js';
import { strings } from '../../content/strings.js';
import {
  deriveProjectPhase,
  canMutateCanvas as canMutateCanvasInvariant,
  getEffectiveProjectId,
  resolveHeaderProjectName,
  resolveActiveProjectIdRefSync,
} from '../../lib/syncProjectionInvariants.js';
import {
  resolveInitialProjectId,
  resolveRecoverLocalBodyId,
} from '../../lib/resolveInitialProjectId.js';
import { PROJECT_PHASE } from './workspaceProjectionTypes.js';
import { flowTrace } from '../../lib/sync/syncTrace.js';

/**
 * Single workspace projection coordinator: selection lifecycle, display fields, mutation guards.
 */
export function useWorkspaceProjection({
  refs: {
    activeProjectIdRef,
    stateRef,
    stagedSyncCardsRef,
    switchingProjectRef,
    projectSwitchSeqRef,
    projectHydratedRef,
    folderRestoreHandledSeqRef,
    folderPresentKeysRef,
    projectNameDirtyRef,
    lastAppliedSyncLockRef,
    userAdjustedViewRef,
    canMutateCanvasRef,
    committedProjectIdRef,
  },
  ui: {
    activeProjectId,
    pendingSwitchProjectId,
    projectSwitchLoading,
    projectList,
    loaded,
    indexActiveProjectId,
    stateProjectName,
    setActiveProjectId,
    setIndexActiveProjectId,
    setPendingSwitchProjectId,
    setProjectSwitchLoading,
    setProjectList,
    setSyncStatus,
    setSyncLock,
    setState,
    setFolderLinkInProgress,
  },
  deps: {
    folderHandle,
    getClientRevision,
    loadProjectIntoState,
    loadProjectIntoStateRef,
    loadAgentChatThreadIndexEarly,
    singleConnectorId,
    syncActiveProjectNameFromIndex,
    alignProjectTitleFromIndex,
    continueProjectSwitchBackground,
    linkProjectFolder,
    warnFolderNameMismatch,
    scanFolder,
    reconcileAllThreadChatCards,
    requestStructuralSync,
    resetProjectUi,
    clearStaleSyncBanners,
    flushPendingPlacementCommit,
    flushPendingPlacementCommitForSwitch,
  },
}) {
  const loadProjectIntoStateStableRef = useRef(loadProjectIntoState);
  loadProjectIntoStateStableRef.current = loadProjectIntoState;

  useEffect(() => {
    if (loadProjectIntoStateRef) {
      loadProjectIntoStateRef.current = loadProjectIntoState;
    }
  }, [loadProjectIntoState, loadProjectIntoStateRef]);

  const committedProjectId = activeProjectId;
  const pendingProjectId = pendingSwitchProjectId;
  const effectiveProjectId = getEffectiveProjectId(
    pendingProjectId,
    committedProjectId,
  );

  const phase = deriveProjectPhase({
    loaded,
    projectListLength: projectList.length,
    pendingSwitchProjectId: pendingProjectId,
    projectSwitchLoading,
    committedProjectId,
  });

  const hydrated = Boolean(
    effectiveProjectId && projectHydratedRef.current.has(effectiveProjectId),
  );

  const projection = useMemo(() => {
    const displayProjectName = resolveHeaderProjectName({
      projectList,
      effectiveProjectId,
      committedProjectId,
      stateProjectName: stateProjectName ?? stateRef.current.projectName,
      projectNameDirty: projectNameDirtyRef.current,
      defaultName: strings.defaultProjectName,
    });
    const core = {
      effectiveProjectId,
      committedProjectId,
      pendingProjectId,
      displayProjectName,
      phase,
      hydrated,
      indexActiveProjectId: indexActiveProjectId ?? null,
      clientRevision: effectiveProjectId
        ? getClientRevision(effectiveProjectId)
        : null,
    };
    return {
      ...core,
      canMutateCanvas: canMutateCanvasInvariant(core),
    };
  }, [
    effectiveProjectId,
    committedProjectId,
    pendingProjectId,
    phase,
    hydrated,
    projectList,
    indexActiveProjectId,
    stateProjectName,
    stateRef,
    projectNameDirtyRef,
    getClientRevision,
  ]);

  useEffect(() => {
    activeProjectIdRef.current = resolveActiveProjectIdRefSync({
      effectiveProjectId,
      committedProjectId,
      pendingProjectId,
      projectSwitchLoading,
      switchingProject: switchingProjectRef.current,
      currentRef: activeProjectIdRef.current,
    });
  }, [
    effectiveProjectId,
    committedProjectId,
    pendingProjectId,
    projectSwitchLoading,
    activeProjectIdRef,
    switchingProjectRef,
  ]);

  useEffect(() => {
    if (committedProjectIdRef) {
      committedProjectIdRef.current = committedProjectId;
    }
  }, [committedProjectId, committedProjectIdRef]);

  useEffect(() => {
    if (canMutateCanvasRef) {
      canMutateCanvasRef.current = projection.canMutateCanvas;
    }
  }, [projection.canMutateCanvas, canMutateCanvasRef]);

  const restoreWorkspaceProject = useCallback(
    async (projectId) => {
      if (!projectId) {
        if (projectList.length > 0) {
          activeProjectIdRef.current = null;
          setActiveProjectId(null);
          return;
        }
        activeProjectIdRef.current = null;
        setActiveProjectId(null);
        return;
      }
      activeProjectIdRef.current = projectId;
      setActiveProjectId(projectId);
      projectNameDirtyRef.current = false;
      const index = await loadProjectIndex();
      setIndexActiveProjectId?.(index?.activeProjectId ?? null);
      syncActiveProjectNameFromIndex(index);
      alignProjectTitleFromIndex(projectId, index);
      await loadProjectIntoStateStableRef.current(projectId, {
        localOnly: true,
        hydratePreviews: false,
      });
    },
    [
      projectList.length,
      activeProjectIdRef,
      setActiveProjectId,
      setIndexActiveProjectId,
      projectNameDirtyRef,
      syncActiveProjectNameFromIndex,
      alignProjectTitleFromIndex,
    ],
  );

  const selectProject = useCallback(
    async (
      targetId,
      {
        reason = 'user',
        showSwitchLoading = true,
        commitOutgoing = true,
        force = false,
        rollbackProjectId,
      } = {},
    ) => {
      if (shouldSkipProjectSwitch(targetId, activeProjectIdRef, projectHydratedRef)) {
        if (!force) {
          flowTrace('project:switch-skip', {
            projectId: targetId,
            reason: 'already_hydrated',
          });
          return { ok: true, skipped: true, projectId: targetId, cards: null };
        }
      }
      let outcome = {
        ok: false,
        projectId: targetId,
        cards: null,
        error: null,
      };
      const { outgoingProjectId } = buildProjectSwitchCommitPlan({
        targetId,
        currentActiveProjectId: activeProjectIdRef.current,
        commitOutgoing,
      });
      perfMark('switch/start');
      const switchSeq = ++projectSwitchSeqRef.current;
      flowTrace('project:switch-start', {
        projectId: targetId,
        reason,
        switchSeq,
        outgoingProjectId,
      });
      switchingProjectRef.current = true;

      const previousActiveId = activeProjectIdRef.current;
      const restoreProjectId =
        rollbackProjectId === undefined ? previousActiveId : rollbackProjectId;
      let outgoingState = null;
      let outgoingStaged = [];
      let outgoingPlacements = null;

      if (outgoingProjectId) {
        outgoingState = { ...stateRef.current };
        outgoingStaged = [...stagedSyncCardsRef.current];
        outgoingPlacements = patchPlacementsMapFromArrays(
          getCommittedPayload(outgoingProjectId)?.artifactPlacements ?? {},
          outgoingState.cards ?? [],
          outgoingStaged,
        );
      }

      if (showSwitchLoading) {
        setProjectSwitchLoading(true);
      }
      setPendingSwitchProjectId(targetId);
      resetProjectUi();
      projectHydratedRef.current.delete(targetId);
      projectNameDirtyRef.current = false;
      setState((prev) => ({
        ...prev,
        ...buildSwitchPlaceholderState(
          projectList.find((p) => p.id === targetId),
          strings.defaultProjectName,
        ),
      }));

      if (outgoingProjectId) {
        try {
          await flushPendingPlacementCommit?.();
        } catch (e) {
          console.warn('Flush pending placement before switch failed:', e);
        }
        try {
          await flushPendingPlacementCommitForSwitch?.(outgoingProjectId);
        } catch (e) {
          console.warn('Flush pending placement (switch) failed:', e);
        }
        flowTrace('project:switch-outgoing-commit', {
          projectId: outgoingProjectId,
          switchSeq,
          cardCount: outgoingState.cards?.length ?? 0,
        });
        try {
          await commitProjectDocument(outgoingProjectId, {
            state: outgoingState,
            stagedSyncCards: outgoingStaged,
            artifactPlacements: outgoingPlacements,
            suppressedSyncKeys: suppressedKeysForSave(
              outgoingProjectId,
              outgoingState,
            ),
            stripNoteContent:
              Boolean(folderHandle)
              && Boolean(folderPresentKeysRef.current?.length)
              && isServerSyncEnabled(),
            reason: 'projectSwitch:outgoing',
            pushRemote: false,
          });
          clearCommittedPayloadCache(outgoingProjectId);
          flowTrace('project:switch-outgoing-done', {
            projectId: outgoingProjectId,
            switchSeq,
            cardCount: outgoingState.cards?.length ?? 0,
          });
        } catch (e) {
          console.warn('Outgoing project local commit during switch failed:', e);
        }
      }

      try {
        let cards = null;
        await withSwitchPaintTimeout(async () => {
          activeProjectIdRef.current = targetId;
          const index = await loadProjectIndex();
          const row = index?.projects?.find((p) => p.id === targetId);
          projectNameDirtyRef.current = false;
          setSyncLock('live');
          lastAppliedSyncLockRef.current = 'live';
          setSyncStatus(clearStaleSyncBanners);
          setState((prev) => ({
            ...prev,
            ...buildSwitchPlaceholderState(row, strings.defaultProjectName),
          }));

          folderRestoreHandledSeqRef.current = null;

          await loadAgentChatThreadIndexEarly(targetId, singleConnectorId);
          let loadedCards = await loadProjectIntoStateStableRef.current(targetId, {
            switchSeq,
            hydratePreviews: false,
            localOnly: true,
          });
          if (
            shouldRetrySwitchLoad(
              loadedCards,
              targetId,
              activeProjectIdRef.current,
              switchSeq,
              projectSwitchSeqRef.current,
            )
          ) {
            loadedCards = await loadProjectIntoStateStableRef.current(targetId, {
              localOnly: true,
              hydratePreviews: false,
            });
          }
          if (
            isServerSyncEnabled()
            && shouldRetrySwitchLoad(
              loadedCards,
              targetId,
              activeProjectIdRef.current,
              switchSeq,
              projectSwitchSeqRef.current,
            )
          ) {
            try {
              flowTrace('project:switch-server-pull-start', { projectId: targetId });
              const pullResult = await pullProjectDocumentIfServerNewer(targetId, {
                force: true,
                acceptServerPayload: true,
              });
              flowTrace('project:switch-server-pull-done', {
                projectId: targetId,
                pulled: Boolean(pullResult.pulled),
              });
              if (pullResult.pulled && pullResult.payload) {
                loadedCards = await loadProjectIntoStateStableRef.current(targetId, {
                  localOnly: true,
                  hydratePreviews: false,
                  document: pullResult.payload,
                });
              }
            } catch (e) {
              flowTrace('project:switch-server-pull-failed', {
                projectId: targetId,
                message: e?.message,
              });
              console.warn('Switch server pull for target project failed:', e);
            }
          }
          cards = loadedCards;
        });
        perfMark('switch/paint');
        perfMeasure('switch/paint', 'switch/start', 'switch/paint');

        const switchStillCurrent = projectSwitchSeqRef.current === switchSeq;

        if (switchStillCurrent && cards != null && reconcileAllThreadChatCards()) {
          requestStructuralSync();
        }

        if (cards == null) {
          if (switchStillCurrent) {
            flowTrace('project:switch-load-failed', {
              projectId: targetId,
              switchSeq,
              previousActiveId: restoreProjectId,
            });
            await restoreWorkspaceProject(restoreProjectId ?? null);
            setSyncStatus({ error: strings.projects.switchLoadFailed });
            setTimeout(() => setSyncStatus(null), 6000);
          }
        } else if (switchStillCurrent) {
          outcome = {
            ok: true,
            projectId: targetId,
            cards,
            error: null,
          };
          flowTrace('project:switch-load-ok', {
            projectId: targetId,
            switchSeq,
            cardCount: cards.length,
          });
          setActiveProjectId(targetId);
          await persistActiveProjectId(targetId);
          setIndexActiveProjectId?.(targetId);
          const view = stateRef.current.canvasView;
          userAdjustedViewRef.current = Boolean(
            view
            && Number.isFinite(view.x)
            && Number.isFinite(view.y)
            && Number.isFinite(view.zoom),
          );
          const refreshedIndex = await loadProjectIndex();
          setIndexActiveProjectId?.(refreshedIndex?.activeProjectId ?? targetId);
          alignProjectTitleFromIndex(targetId, refreshedIndex);
          syncActiveProjectNameFromIndex(refreshedIndex);
          void continueProjectSwitchBackground(targetId, switchSeq, {
            projectId: outgoingProjectId,
            state: outgoingState,
            stagedSyncCards: outgoingStaged,
            artifactPlacements: outgoingPlacements,
          });
          void (async () => {
            if (projectSwitchSeqRef.current !== switchSeq) return;
            setFolderLinkInProgress(true);
            let switchLinkResult = {
              granted: false,
              handle: null,
              stored: false,
            };
            try {
              switchLinkResult = await linkProjectFolder(targetId, {
                requestIfNeeded: false,
                switchSeq,
              });
              if (projectSwitchSeqRef.current !== switchSeq) return;
              if (switchLinkResult.granted && switchLinkResult.handle) {
                warnFolderNameMismatch(targetId, switchLinkResult.handle);
                try {
                  await scanFolder(switchLinkResult.handle, {
                    baseCards: cards ?? [],
                    projectId: targetId,
                  });
                  if (projectSwitchSeqRef.current === switchSeq) {
                    folderRestoreHandledSeqRef.current = {
                      projectId: targetId,
                      switchSeq,
                    };
                  }
                } catch (scanErr) {
                  console.warn('Folder scan after project switch failed:', scanErr);
                }
              }
            } finally {
              if (projectSwitchSeqRef.current === switchSeq) {
                setFolderLinkInProgress(false);
              }
            }
          })();
        }
      } catch (e) {
        console.error('Project switch failed:', e);
        outcome = {
          ok: false,
          projectId: targetId,
          cards: null,
          error: e,
        };
        if (projectSwitchSeqRef.current === switchSeq) {
          await restoreWorkspaceProject(restoreProjectId ?? null);
          const message =
            e?.code === 'SWITCH_TIMEOUT'
              ? strings.projects.switchTimeout
              : strings.projects.switchLoadFailed;
          setSyncStatus({ error: message });
          setTimeout(() => setSyncStatus(null), 6000);
        }
      } finally {
        const switchStillCurrent = projectSwitchSeqRef.current === switchSeq;
        flowTrace('project:switch-finally', {
          projectId: targetId,
          switchSeq,
          switchStillCurrent,
        });
        if (switchStillCurrent) {
          setPendingSwitchProjectId(null);
          setFolderLinkInProgress(false);
          switchingProjectRef.current = false;
          if (showSwitchLoading) {
            setProjectSwitchLoading(false);
          }
        }
      }
      return outcome;
    },
    [
      activeProjectIdRef,
      stateRef,
      stagedSyncCardsRef,
      switchingProjectRef,
      projectSwitchSeqRef,
      projectHydratedRef,
      folderRestoreHandledSeqRef,
      folderPresentKeysRef,
      projectNameDirtyRef,
      lastAppliedSyncLockRef,
      userAdjustedViewRef,
      setProjectSwitchLoading,
      setPendingSwitchProjectId,
      setFolderLinkInProgress,
      setActiveProjectId,
      setIndexActiveProjectId,
      setSyncLock,
      setSyncStatus,
      setState,
      resetProjectUi,
      folderHandle,
      clearStaleSyncBanners,
      loadAgentChatThreadIndexEarly,
      singleConnectorId,
      syncActiveProjectNameFromIndex,
      alignProjectTitleFromIndex,
      continueProjectSwitchBackground,
      linkProjectFolder,
      warnFolderNameMismatch,
      scanFolder,
      reconcileAllThreadChatCards,
      requestStructuralSync,
      restoreWorkspaceProject,
      flushPendingPlacementCommit,
      flushPendingPlacementCommitForSwitch,
    ],
  );

  const commitBoot = useCallback(
    async (index, activeId, { recoverLocalBody = false } = {}) => {
      if (!activeId) {
        flowTrace('project:boot-empty', {});
        setState((prev) => ({
          ...prev,
          cards: [],
          projectName: strings.defaultProjectName,
        }));
        return null;
      }

      let targetId = activeId;
      if (recoverLocalBody) {
        const richerId = await findBestProjectIdWithLocalCanvas(index);
        targetId = resolveRecoverLocalBodyId(
          activeId,
          richerId,
          committedProjectId == null,
        );
      }

      flowTrace('project:boot-start', {
        projectId: targetId,
        recoverLocalBody,
      });
      switchingProjectRef.current = true;
      setPendingSwitchProjectId(targetId);
      activeProjectIdRef.current = targetId;

      try {
        flowTrace('project:boot-placeholder', { projectId: targetId });
        setProjectList(projectsForMenuFromIndex(index));
        setIndexActiveProjectId?.(index?.activeProjectId ?? null);
        projectNameDirtyRef.current = false;
        const row = index.projects?.find((p) => p.id === targetId);
        setState((prev) => ({
          ...prev,
          ...buildSwitchPlaceholderState(row, strings.defaultProjectName),
        }));
        let serverBootDocument = null;
        if (isServerSyncEnabled()) {
          flowTrace('project:boot-server-pull-start', { projectId: targetId });
          const pullResult = await pullProjectDocumentIfServerNewer(targetId, {
            force: true,
            acceptServerPayload: true,
          });
          serverBootDocument =
            pullResult?.pulled && pullResult?.payload
              ? pullResult.payload
              : null;
          flowTrace('project:boot-server-pull-done', {
            projectId: targetId,
            pulled: Boolean(pullResult?.pulled),
          });
        }
        flowTrace('project:boot-chat-index-start', { projectId: targetId });
        await loadAgentChatThreadIndexEarly(targetId, singleConnectorId);
        flowTrace('project:boot-chat-index-done', { projectId: targetId });
        flowTrace('project:boot-local-load-start', { projectId: targetId });
        let cards = await loadProjectIntoStateStableRef.current(targetId, {
          localOnly: true,
          hydratePreviews: false,
          ...(serverBootDocument ? { document: serverBootDocument } : {}),
        });
        flowTrace('project:boot-local-load-done', {
          projectId: targetId,
          cardCount: cards?.length ?? null,
        });
        if (cards == null) {
          flowTrace('project:boot-local-load-retry-start', { projectId: targetId });
          cards = await loadProjectIntoStateStableRef.current(targetId, {
            localOnly: true,
            hydratePreviews: false,
          });
          flowTrace('project:boot-local-load-retry-done', {
            projectId: targetId,
            cardCount: cards?.length ?? null,
          });
        }
        if ((cards == null || cards.length === 0) && isServerSyncEnabled()) {
          try {
            flowTrace('project:boot-server-pull-start', { projectId: targetId });
            const pullResult = await pullProjectDocumentIfServerNewer(targetId, {
              force: true,
            });
            flowTrace('project:boot-server-pull-done', {
              projectId: targetId,
              pulled: Boolean(pullResult.pulled),
            });
            if (pullResult.pulled && pullResult.payload) {
              const pulledCards = await loadProjectIntoStateStableRef.current(targetId, {
                localOnly: true,
                hydratePreviews: false,
                document: pullResult.payload,
              });
              if (pulledCards != null) {
                cards = pulledCards;
              }
              flowTrace('project:boot-server-pull-load-done', {
                projectId: targetId,
                cardCount: cards?.length ?? null,
              });
            }
          } catch (e) {
            flowTrace('project:boot-server-pull-failed', {
              projectId: targetId,
              message: e?.message,
            });
            console.warn('Boot server pull for active project failed:', e);
          }
        }
        if (cards != null) {
          flowTrace('project:boot-activate-start', {
            projectId: targetId,
            cardCount: cards.length,
          });
          setActiveProjectId(targetId);
          await persistActiveProjectId(targetId);
          setIndexActiveProjectId?.(targetId);
          const displayName = resolveProjectDisplayName(
            index,
            targetId,
            strings.defaultProjectName,
          );
          stateRef.current = { ...stateRef.current, projectName: displayName };
          setState((prev) => ({ ...prev, projectName: displayName }));
          syncActiveProjectNameFromIndex(index);
          flowTrace('project:boot-activate-done', { projectId: targetId });
        } else {
          flowTrace('project:boot-load-failed', { projectId: targetId });
          const failName = resolveProjectDisplayName(
            index,
            targetId,
            strings.defaultProjectName,
          );
          activeProjectIdRef.current = null;
          setActiveProjectId(null);
          setState((prev) => ({
            ...prev,
            cards: [],
            projectName: failName,
          }));
        }
        return cards;
      } finally {
        flowTrace('project:boot-finally', { projectId: targetId });
        setPendingSwitchProjectId(null);
        switchingProjectRef.current = false;
      }
    },
    [
      committedProjectId,
      activeProjectIdRef,
      switchingProjectRef,
      projectNameDirtyRef,
      stateRef,
      setActiveProjectId,
      setPendingSwitchProjectId,
      setProjectList,
      setIndexActiveProjectId,
      syncActiveProjectNameFromIndex,
      setState,
      loadAgentChatThreadIndexEarly,
      singleConnectorId,
      projectList.length,
    ],
  );

  const resolveBootTargetId = useCallback(async (index) => {
    const honorId = resolveInitialProjectId(index);
    if (!honorId) return null;
    return honorId;
  }, []);

  const commitBootWithRecovery = useCallback(
    async (index) => {
      const honorId = resolveInitialProjectId(index);
      if (!honorId) {
        await commitBoot(index, null);
        return null;
      }
      switchingProjectRef.current = true;
      let cards = null;
      try {
        cards = await commitBoot(index, honorId, { recoverLocalBody: false });
        if (
          (cards == null || cards.length === 0)
          && committedProjectId == null
        ) {
          const richerId = await findBestProjectIdWithLocalCanvas(index);
          if (richerId && richerId !== honorId) {
            cards = await commitBoot(index, richerId, { recoverLocalBody: false });
          }
        }
      } finally {
        setPendingSwitchProjectId(null);
        switchingProjectRef.current = false;
      }
      return cards;
    },
    [commitBoot, committedProjectId, switchingProjectRef, setPendingSwitchProjectId],
  );

  return {
    projection,
    phase,
    effectiveProjectId,
    selectProject,
    commitBoot,
    commitBootWithRecovery,
    resolveBootTargetId,
    restoreWorkspaceProject,
    isNoProjects: phase === PROJECT_PHASE.NO_PROJECTS,
  };
}

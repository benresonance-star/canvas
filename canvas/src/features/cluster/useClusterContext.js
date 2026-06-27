import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { strings } from '../../content/strings.js';
import {
  createSubCluster,
  listSubClusters,
  fetchClusterMembers,
  fetchHealth,
  clusterApiStatusFromHealth,
  clusterProjectStreamUrl,
} from '../../lib/primitivesApi.js';
import {
  resolveWorkspaceClusterId,
  isClusterContextValid,
  EMPTY_CLUSTER_HULL_SOURCE,
} from '../../lib/clusterProjectContext.js';
import { artifactMembersFromCards } from '../../lib/clusterMembers.js';
import {
  buildArtifactToCardMap,
  loadCanvasGraph,
} from '../../lib/graph/clusterGraph.js';

export function useClusterContext({
  refs: {
    activeProjectIdRef,
    stateRef,
    clusterContextProjectIdRef,
    refreshGraphRef,
    applyClusterContextForProjectRef,
    refreshClusterApiHealthRef,
    refreshProjectClusterStateRef,
  },
  deps: {
    loaded,
    activeProjectId,
    projectSwitchLoading,
    state,
    setSyncStatus,
    switchingProjectRef,
    refreshingFromServerRef,
    clusterMemberOptionsRef,
    setCreatingCluster,
    setCreateClusterOpen,
  },
}) {
  const [clusterId, setClusterId] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorSelection, setInspectorSelection] = useState(null);
  const [selectedClusterId, setSelectedClusterId] = useState(null);
  const [clusterInspectorReload, setClusterInspectorReload] = useState(0);
  const [clusterApiAvailable, setClusterApiAvailable] = useState(false);
  /** @type {'ok' | 'api_unreachable' | 'db_unavailable'} */
  const [clusterApiReason, setClusterApiReason] = useState('db_unavailable');
  const lastClusterErrorToastRef = useRef('');
  const [selectedCardIds, setSelectedCardIds] = useState(() => new Set());
  const removeCardFromSelection = useCallback((cardId) => {
    setSelectedCardIds((prev) => {
      if (!prev.has(cardId)) return prev;
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
  }, []);
  const [canvasEdges, setCanvasEdges] = useState([]);
  const [linkCountByCardId, setLinkCountByCardId] = useState(() => new Map());
  const [clusterHullSource, setClusterHullSource] = useState({
    clusters: [],
    membersByClusterId: new Map(),
  });
  const [workspaceTreeOpen, setWorkspaceTreeOpen] = useState(false);
  const [workspaceTreeReloadKey, setWorkspaceTreeReloadKey] = useState(0);

  const reportClusterError = useCallback((message) => {
    const msg = message || strings.cluster.hullsLoadFailed;
    if (lastClusterErrorToastRef.current === msg) return;
    lastClusterErrorToastRef.current = msg;
    setSyncStatus({ error: msg });
    setTimeout(() => {
      setSyncStatus((prev) => (prev?.error === msg ? null : prev));
      if (lastClusterErrorToastRef.current === msg) {
        lastClusterErrorToastRef.current = '';
      }
    }, 6000);
  }, []);

  const refreshClusterApiHealth = useCallback(async () => {
    const health = await fetchHealth();
    const status = clusterApiStatusFromHealth(health);
    setClusterApiAvailable(status.available);
    setClusterApiReason(status.reason);
    return status;
  }, []);

  const countClusterHullMatches = useCallback((clusters, membersByClusterId, cards) => {
    const artifactMap = buildArtifactToCardMap(cards ?? []);
    let memberCount = 0;
    let matchedCardCount = 0;
    for (const cluster of clusters ?? []) {
      const members = membersByClusterId.get(cluster.id) || [];
      for (const member of members) {
        if (member.type !== 'artifact') continue;
        memberCount += 1;
        if (artifactMap.has(member.id)) matchedCardCount += 1;
      }
    }
    const cardsWithArtifactRefs = artifactMap.size;
    return { memberCount, matchedCardCount, cardsWithArtifactRefs };
  }, []);

  const loadClusterHullSource = useCallback(async (projectIdOverride) => {
    const projectId = projectIdOverride ?? activeProjectIdRef.current;
    if (!projectId) {
      setClusterHullSource(EMPTY_CLUSTER_HULL_SOURCE);
      return {
        ok: true,
        subclusterCount: 0,
        memberCount: 0,
        matchedCardCount: 0,
        cardsWithArtifactRefs: 0,
      };
    }
    try {
      const { clusters } = await listSubClusters(projectId);
      const membersByClusterId = new Map();
      await Promise.all(
        (clusters || []).map(async (c) => {
          const { members } = await fetchClusterMembers(c.id);
          membersByClusterId.set(c.id, members || []);
        }),
      );
      const safeClusters = clusters || [];
      const counts = countClusterHullMatches(
        safeClusters,
        membersByClusterId,
        stateRef.current.cards ?? [],
      );
      setClusterHullSource({ clusters: safeClusters, membersByClusterId });
      if (
        import.meta.env?.DEV
        && safeClusters.length > 0
        && counts.memberCount > 0
        && counts.cardsWithArtifactRefs > 0
        && counts.matchedCardCount === 0
      ) {
        console.info('[cluster] hull members did not match canvas cards', {
          projectId,
          subclusterCount: safeClusters.length,
          ...counts,
        });
      }
      return {
        ok: true,
        subclusterCount: safeClusters.length,
        ...counts,
      };
    } catch (e) {
      setClusterHullSource(EMPTY_CLUSTER_HULL_SOURCE);
      const msg = e?.message || strings.cluster.hullsLoadFailed;
      return { ok: false, error: msg };
    }
  }, [countClusterHullMatches]);

  const refreshCanvasEdges = useCallback(async (opts = {}) => {
    const {
      clusterId: cidOverride,
      projectId: projectIdOverride,
      force = false,
    } = opts;
    const projectId = projectIdOverride ?? activeProjectIdRef.current;
    if (
      !force
      && !isClusterContextValid(projectId, clusterContextProjectIdRef.current)
    ) {
      return;
    }
    const cid = cidOverride ?? clusterId;
    const cards = stateRef.current.cards;
    if (!cid) {
      setCanvasEdges([]);
      setLinkCountByCardId(new Map());
      return;
    }
    try {
      const graphResult = await loadCanvasGraph(cid, cards);
      setCanvasEdges(graphResult.canvasEdges);
      setLinkCountByCardId(graphResult.linkCountByCardId);
    } catch (e) {
      setCanvasEdges([]);
      setLinkCountByCardId(new Map());
      reportClusterError(e?.message);
    }
  }, [clusterId, reportClusterError]);

  const refreshGraph = useCallback(async (opts = {}) => {
    const {
      clusterId: cidOverride,
      projectId: projectIdOverride,
      force = false,
    } = opts;
    const projectId = projectIdOverride ?? activeProjectIdRef.current;
    if (
      !force
      && !isClusterContextValid(projectId, clusterContextProjectIdRef.current)
    ) {
      return;
    }
    const cid = cidOverride ?? clusterId;
    const cards = stateRef.current.cards;
    if (!cid) {
      setCanvasEdges([]);
      setLinkCountByCardId(new Map());
      const hullResult = await loadClusterHullSource(projectId);
      if (hullResult?.ok === false && hullResult.error) {
        reportClusterError(hullResult.error);
      }
      setClusterInspectorReload((k) => k + 1);
      return {
        ok: hullResult?.ok !== false,
        clusterId: cid ?? null,
        ...(hullResult ?? {}),
      };
    }
    try {
      const [graphResult, hullResult] = await Promise.all([
        loadCanvasGraph(cid, cards),
        loadClusterHullSource(projectId),
      ]);
      const { canvasEdges: edges, linkCountByCardId: counts } = graphResult;
      setCanvasEdges(edges);
      setLinkCountByCardId(counts);
      if (hullResult?.ok === false && hullResult.error) {
        reportClusterError(hullResult.error);
      }
      setClusterInspectorReload((k) => k + 1);
      setWorkspaceTreeReloadKey((k) => k + 1);
      return {
        ok: hullResult?.ok !== false,
        clusterId: cid,
        ...(hullResult ?? {}),
      };
    } catch (e) {
      setCanvasEdges([]);
      setLinkCountByCardId(new Map());
      const hullResult = await loadClusterHullSource(projectId);
      if (hullResult?.ok === false && hullResult.error) {
        reportClusterError(hullResult.error);
      } else {
        reportClusterError(e?.message);
      }
      setClusterInspectorReload((k) => k + 1);
      setWorkspaceTreeReloadKey((k) => k + 1);
      return {
        clusterId: cid,
        error: e?.message || strings.cluster.hullsLoadFailed,
        ...(hullResult ?? {}),
        ok: false,
      };
    }
  }, [clusterId, loadClusterHullSource, reportClusterError]);

  useEffect(() => {
    refreshGraphRef.current = refreshGraph;
  }, [refreshGraph]);

  const refreshProjectClusterState = useCallback(
    async ({ projectId, projectName, force = true } = {}) => {
      if (!projectId) {
        clusterContextProjectIdRef.current = null;
        setClusterId(null);
        return { ok: false, clusterId: null, error: 'projectId required' };
      }
      try {
        const healthStatus = await refreshClusterApiHealth();
        if (!healthStatus.available) {
          clusterContextProjectIdRef.current = projectId;
          return {
            ok: false,
            clusterId: clusterId ?? null,
            error: strings.cluster.dbUnavailableBanner,
            reason: healthStatus.reason,
          };
        }
        const cid = await resolveWorkspaceClusterId(projectId, projectName);
        if (!cid) {
          reportClusterError(strings.cluster.workspaceClusterFailed);
          clusterContextProjectIdRef.current = projectId;
          setClusterId(null);
          return {
            ok: false,
            clusterId: null,
            error: strings.cluster.workspaceClusterFailed,
          };
        }
        clusterContextProjectIdRef.current = projectId;
        setClusterId(cid);
        const refreshResult = await refreshGraphRef.current({
          clusterId: cid,
          projectId,
          force,
        });
        return {
          ok: refreshResult?.ok !== false,
          clusterId: cid,
          ...(refreshResult ?? {}),
        };
      } catch (e) {
        reportClusterError(e?.message || strings.cluster.workspaceClusterFailed);
        clusterContextProjectIdRef.current = projectId;
        setClusterId(null);
        return {
          ok: false,
          clusterId: null,
          error: e?.message || strings.cluster.workspaceClusterFailed,
        };
      }
    },
    [clusterId, refreshClusterApiHealth, reportClusterError],
  );

  useEffect(() => {
    if (refreshProjectClusterStateRef) {
      refreshProjectClusterStateRef.current = refreshProjectClusterState;
    }
  }, [refreshProjectClusterState, refreshProjectClusterStateRef]);

  const applyClusterContextForProject = useCallback(
    async (projectId, projectName, { refresh = true } = {}) => {
      const result = await refreshProjectClusterState({
        projectId,
        projectName,
        force: refresh,
      });
      return result.clusterId ?? null;
    },
    [refreshProjectClusterState],
  );

  const handleClusterRenamed = useCallback((renamedClusterId, name) => {
    setClusterHullSource((prev) => ({
      ...prev,
      clusters: prev.clusters.map((c) =>
        c.id === renamedClusterId ? { ...c, name } : c,
      ),
    }));
  }, []);

  const highlightedClusterId =
    selectedClusterId ??
    (inspectorOpen && inspectorSelection?.type === 'cluster'
      ? inspectorSelection.id
      : null);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    setInspectorSelection(null);
  }, []);

  const closeWorkspaceTree = useCallback(() => {
    setWorkspaceTreeOpen(false);
  }, []);

  const toggleWorkspaceTree = useCallback(() => {
    setWorkspaceTreeOpen((open) => !open);
  }, []);

  const openInspector = useCallback((selection) => {
    setInspectorSelection(selection);
    setInspectorOpen(true);
    if (selection.type === 'cluster') {
      setSelectedClusterId(selection.id);
    }
  }, []);

  const toggleCardSelect = useCallback((cardId) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const clearCardSelection = useCallback(() => {
    setSelectedCardIds(new Set());
  }, []);

  const handleCreateClusterFromSelection = useCallback(
    async ({ name, purpose }) => {
      const projectId = activeProjectIdRef.current;
      if (!projectId) {
        setSyncStatus({ error: strings.inspector.emptyNoCluster });
        setTimeout(() => setSyncStatus(null), 4000);
        return;
      }
      const cards = stateRef.current.cards.filter((c) => selectedCardIds.has(c.id));
      const members = artifactMembersFromCards(cards, clusterMemberOptionsRef.current);
      if (members.length === 0) {
        setSyncStatus({ error: strings.cluster.noArtifactsSelected });
        setTimeout(() => setSyncStatus(null), 4000);
        return;
      }
      const healthStatus = await refreshClusterApiHealth();
      if (!healthStatus.available) {
        const msg =
          healthStatus.reason === 'api_unreachable'
            ? strings.cluster.apiUnreachableBanner
            : strings.cluster.dbUnavailableBanner;
        setSyncStatus({ error: msg });
        setTimeout(() => setSyncStatus(null), 6000);
        return;
      }
      setCreatingCluster(true);
      try {
        const parentClusterId = await resolveWorkspaceClusterId(
          projectId,
          stateRef.current.projectName,
        );
        if (parentClusterId) {
          clusterContextProjectIdRef.current = projectId;
          setClusterId(parentClusterId);
        }
        if (!parentClusterId) {
          setSyncStatus({ error: strings.inspector.emptyNoCluster });
          setTimeout(() => setSyncStatus(null), 4000);
          return;
        }
        const { cluster } = await createSubCluster({
          parentClusterId,
          projectId,
          name,
          purpose,
          members,
        });
        setCreateClusterOpen(false);
        clearCardSelection();
        openInspector({ type: 'cluster', id: cluster.id });
        await refreshGraph();
        setSyncStatus({ toast: strings.cluster.created });
        setTimeout(() => setSyncStatus(null), 4000);
      } catch (e) {
        setSyncStatus({ error: e.message || strings.cluster.createFailed });
        setTimeout(() => setSyncStatus(null), 4000);
      } finally {
        setCreatingCluster(false);
      }
    },
    [
      selectedCardIds,
      clearCardSelection,
      openInspector,
      refreshGraph,
      refreshClusterApiHealth,
      clusterMemberOptionsRef,
    ],
  );

  useEffect(() => {
    applyClusterContextForProjectRef.current = applyClusterContextForProject;
  }, [applyClusterContextForProject]);

  const resetClusterUi = useCallback(() => {
    setClusterId(null);
    clusterContextProjectIdRef.current = null;
    setSelectedClusterId(null);
    setInspectorOpen(false);
    setInspectorSelection(null);
    setClusterHullSource(EMPTY_CLUSTER_HULL_SOURCE);
    setCanvasEdges([]);
    setLinkCountByCardId(new Map());
    setSelectedCardIds(new Set());
    setInspectorSelection((sel) => {
      if (sel?.type === 'cluster') {
        setInspectorOpen(false);
        return null;
      }
      return sel;
    });
  }, []);

  useEffect(() => {
    refreshClusterApiHealthRef.current = refreshClusterApiHealth;
  }, [refreshClusterApiHealth]);

  useEffect(() => {
    if (!loaded) return undefined;
    void refreshClusterApiHealth();
  }, [loaded, refreshClusterApiHealth]);

  useEffect(() => {
    if (!loaded || !activeProjectId || projectSwitchLoading || switchingProjectRef.current) return;
    if (!clusterApiAvailable) return;
    if (clusterContextProjectIdRef.current === activeProjectId && clusterId) return;
    void applyClusterContextForProject(
      activeProjectId,
      stateRef.current.projectName,
    );
  }, [
    activeProjectId,
    loaded,
    projectSwitchLoading,
    clusterApiAvailable,
    clusterId,
    applyClusterContextForProject,
  ]);

  useEffect(() => {
    if (
      !loaded
      || !activeProjectId
      || !clusterApiAvailable
      || typeof EventSource === 'undefined'
    ) {
      return undefined;
    }

    const source = new EventSource(clusterProjectStreamUrl(activeProjectId));
    const refreshFromClusterEvent = () => {
      if (
        switchingProjectRef.current
        || refreshingFromServerRef.current
        || activeProjectIdRef.current !== activeProjectId
      ) {
        return;
      }
      void refreshGraphRef.current({
        projectId: activeProjectId,
        force: true,
      });
    };
    source.addEventListener('clusters_updated', refreshFromClusterEvent);
    return () => {
      source.removeEventListener('clusters_updated', refreshFromClusterEvent);
      source.close();
    };
  }, [
    loaded,
    activeProjectId,
    clusterApiAvailable,
    activeProjectIdRef,
    refreshingFromServerRef,
    switchingProjectRef,
    refreshGraphRef,
  ]);

  useEffect(() => {
    if (
      switchingProjectRef.current
      || projectSwitchLoading
      || refreshingFromServerRef.current
    ) {
      return;
    }
    void refreshCanvasEdges();
  }, [refreshCanvasEdges, state.cards, projectSwitchLoading]);

  const clusterApiUnavailableMessage = useMemo(() => {
    if (clusterApiAvailable) return null;
    if (clusterApiReason === 'api_unreachable') {
      return strings.cluster.apiUnreachableBanner;
    }
    return strings.cluster.dbUnavailableBanner;
  }, [clusterApiAvailable, clusterApiReason]);

  return {
    clusterId,
    setClusterId,
    inspectorOpen,
    setInspectorOpen,
    inspectorSelection,
    setInspectorSelection,
    selectedClusterId,
    setSelectedClusterId,
    clusterInspectorReload,
    setClusterInspectorReload,
    clusterApiAvailable,
    clusterApiReason,
    canvasEdges,
    linkCountByCardId,
    clusterHullSource,
    workspaceTreeOpen,
    setWorkspaceTreeOpen,
    workspaceTreeReloadKey,
    selectedCardIds,
    removeCardFromSelection,
    toggleCardSelect,
    clearCardSelection,
    lastClusterErrorToastRef,
    clusterContextProjectIdRef,
    refreshGraphRef,
    reportClusterError,
    refreshClusterApiHealth,
    loadClusterHullSource,
    refreshCanvasEdges,
    refreshGraph,
    applyClusterContextForProject,
    handleClusterRenamed,
    closeInspector,
    openInspector,
    closeWorkspaceTree,
    toggleWorkspaceTree,
    handleCreateClusterFromSelection,
    highlightedClusterId,
    clusterApiUnavailableMessage,
    resetClusterUi,
  };
}

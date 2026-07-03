import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Redo2, Save, Search, Trash2, Undo2, Workflow, Eye, EyeOff, ArrowLeftRight, PanelLeft, PanelLeftClose, PanelRight, PanelRightClose, Map as MapIcon, Minimize2, ChevronDown, ChevronRight, Play, Pause, StepForward, RotateCcw, Network, FileText } from 'lucide-react';
import { strings } from '../../../content/strings.js';
import { artifactRefIdForClusterCard } from '../../../lib/clusterMembers.js';
import { getMutedStagingStyleForType } from '../../../lib/stagingColors.js';
import { useFlowDocument } from '../hooks/useFlowDocument.js';
import {
  defaultFlowNodePreviewSize,
  flowNodeDisplayTitle,
  flowArtifactNodeDisplayTitle,
  formatFlowSaveError,
  newArtifactFlowNode,
  newLocalFlowNode,
  flowEdgeIsFlowing,
  flowEdgeDirection,
  flowEdgeEndpointTitles,
  FLOW_EDGE_DIRECTION,
  normalizeFlowEdgeForEditor,
  patchFlowNodePresentation,
  removeFlowEdgesById,
  removeFlowNodesById,
  stripFlowNodeDimensions,
} from '../domain/flowDocument.js';
import { patchFlowLocalNodeTypeColor, normalizeFlowLocalNodeTypeColors } from '../domain/flowLocalNodeTypeColors.js';
import { buildFlowNeighborhoodFocus, buildGhostedFlowPathIds } from '../domain/flowNeighborhoodFocus.js';
import {
  buildChildStudioEdge,
  buildChildStudioNode,
  childStudioNodePosition,
  findStudioNodeForCard,
  flowNodeStudioArtifactId,
  studioCardLikeFromOverview,
} from '../domain/flowStudioProjection.js';
import { ArtifactFlowNode, LocalFlowNode } from './FlowNodes.jsx';
import { FlowConnectionInspectorFields } from './FlowConnectionInspectorFields.jsx';
import { FlowEditorProvider } from './FlowEditorContext.jsx';
import { FlowLocalNodeTypeMenu } from './FlowLocalNodeTypeMenu.jsx';
import { FlowLocalNodeTypePicker } from './FlowLocalNodeTypePicker.jsx';
import { FlowNodeActorPicker } from './FlowNodeActorPicker.jsx';
import { FlowPathControls } from './FlowPathControls.jsx';
import { FlowPathHullLayer } from './FlowPathHullLayer.jsx';
import { FlowPathInspectorFields } from './FlowPathInspectorFields.jsx';
import {
  applyDeltaToPathSteps,
  addStepsToFlowPath,
  buildFlowPathHulls,
  createFlowPathFromSelection,
  deleteFlowPath,
  duplicateFlowPath,
  normalizeFlowPaths,
  patchFlowPathName,
  patchPathStepRunState,
  removeStepsFromFlowPath,
} from '../domain/flowPaths.js';
import { resolvePathCurrentActiveStepTitle } from '../domain/flowPathStepDisplay.js';
import { buildPathRunStateByStepId, resolvePathStepRunState } from '../domain/flowStepRunState.js';
import { buildFlowPlaybackSequence, nextFlowPlaybackIndex } from '../domain/flowPlayback.js';
import { FlowStepRunStateMenu } from './FlowStepRunStateMenu.jsx';
import {
  buildFlowNodeSelectionChanges,
  resolveFlowNodeClickSelection,
  selectionsHaveSameNodeIds,
} from './FlowEditorSelection.js';

const NODE_TYPES = { artifact: ArtifactFlowNode, local: LocalFlowNode };
const FLOW_PENDING_SELECTION_GUARD_MS = 300;
const FLOW_PLAYBACK_TICK_MS = 1200;

function FlowPathHullOverlay(props) {
  const { zoom } = useViewport();
  return (
    <ViewportPortal>
      <FlowPathHullLayer zoom={zoom} {...props} />
    </ViewportPortal>
  );
}

const FLOW_INSPECTOR_REMOVE_BUTTON_CLASS =
  'sans w-full flex items-center justify-center gap-1.5 rounded-full border border-danger-border bg-danger-muted text-danger px-3 py-2 text-xs hover:bg-danger-border/40 transition';

function FlowSidebarSection({ title, open, onToggle, children, className = '' }) {
  return (
    <section className={className}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-border hover:bg-surface-muted/50 transition text-left shrink-0"
        aria-expanded={open}
        aria-label={`${open ? strings.flow.collapseFlowSection : strings.flow.expandFlowSection} ${title}`}
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown size={12} className="text-muted shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted shrink-0" />
        )}
        <span className="sans text-[10px] uppercase tracking-wider text-muted">{title}</span>
      </button>
      {open ? children : null}
    </section>
  );
}

function FlowEditorInner({
  card,
  artifactCandidates,
  folderHandle,
  onCardRefresh,
  onRehydratePreview,
  projectId,
  onRegisterContextSnapshot,
  onRegisterFlush,
  onSelectedNodeIdsChange,
  flowAgentScopeNodeIds = null,
  agentModeActive = false,
  flowClosing = false,
  studioContext = null,
  onCreateStudioContextPacket = null,
  onInvokeChildStudio = null,
  onOpenStudioCard = null,
  onRenameStudioNode = null,
  onArchiveStudioNode = null,
  pendingRevealStudioId = null,
  onStudioNodeRevealed = null,
  pendingRestoreStudio = null,
  onRestoreStudioComplete = null,
  pendingPromotedArtifactId = null,
  onPromotedArtifactProjected = null,
}) {
  const flowId = card?.versions?.find((version) => version.version === card.pinnedVersion)?.flowId
    ?? card?.versions?.[0]?.artifactRef?.id;
  const document = useFlowDocument({ flowId, folderHandle, onCardRefresh });
  const [query, setQuery] = useState('');
  const [instance, setInstance] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedPathId, setSelectedPathId] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [neighborhoodFocusEnabled, setNeighborhoodFocusEnabled] = useState(false);
  const [playback, setPlayback] = useState({
    active: false,
    isPlaying: false,
    stepIndex: 0,
    pathId: null,
  });
  const [studioActionStatus, setStudioActionStatus] = useState(null);
  const [childStudioDialogOpen, setChildStudioDialogOpen] = useState(false);
  const [childStudioDraft, setChildStudioDraft] = useState({ title: '', goal: '', useSelection: true });
  const [studioRenameDialog, setStudioRenameDialog] = useState(null);
  const [nodeContextMenu, setNodeContextMenu] = useState(null);
  const [stepsSectionOpen, setStepsSectionOpen] = useState(false);
  const [artifactsSectionOpen, setArtifactsSectionOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const canvasRef = useRef(null);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const viewportSyncedRef = useRef(false);
  const draggingPathRef = useRef(null);
  const pendingNodeSelectionRef = useRef(null);
  const playbackTimerRef = useRef(null);

  const handleSave = useCallback(async () => {
    await document.flushSave();
  }, [document]);

  useEffect(() => {
    viewportSyncedRef.current = false;
    setInspectorOpen(false);
    setStepsSectionOpen(false);
    setArtifactsSectionOpen(false);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    setSelectedPathId(null);
    setNeighborhoodFocusEnabled(false);
    setPlayback({ active: false, isPlaying: false, stepIndex: 0, pathId: null });
  }, [flowId]);

  useEffect(() => () => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (agentModeActive) {
      setInspectorOpen(false);
    }
  }, [agentModeActive]);

  useEffect(() => {
    if (!instance || document.status.loading || !document.flow) return undefined;
    if (viewportSyncedRef.current) return undefined;
    viewportSyncedRef.current = true;
    const frame = requestAnimationFrame(() => {
      if (document.nodes.length > 0) {
        void instance.fitView({ padding: 0.15, duration: 0 });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [document.flow, document.nodes.length, document.status.loading, instance]);

  const candidates = useMemo(() => (artifactCandidates ?? [])
    .filter((candidate) => candidate.type !== 'flow')
    .filter((candidate) => artifactRefIdForClusterCard(candidate))
    .filter((candidate) => `${candidate.name} ${candidate.type}`.toLowerCase().includes(query.toLowerCase())),
  [artifactCandidates, query]);
  const cardsById = useMemo(
    () => new Map((artifactCandidates ?? []).map((candidate) => [candidate.id, candidate])),
    [artifactCandidates],
  );
  const nodesById = useMemo(
    () => new Map(document.nodes.map((node) => [node.id, node])),
    [document.nodes],
  );
  const pathHulls = useMemo(() => {
    const hulls = buildFlowPathHulls({ paths: document.paths, nodes: document.nodes });
    const pathsById = new Map(document.paths.map((path) => [path.id, path]));
    return hulls.map((hull) => {
      const path = pathsById.get(hull.pathId);
      return {
        ...hull,
        currentStepTitle: resolvePathCurrentActiveStepTitle(
          path,
          document.edges,
          nodesById,
          cardsById,
        ),
      };
    });
  }, [cardsById, document.edges, document.nodes, document.paths, nodesById]);
  const selectedNode = document.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedPath = document.paths.find((path) => path.id === selectedPathId) ?? null;
  const selectedNodePath = useMemo(
    () => (selectedNodeId
      ? document.paths.find((path) => path.stepIds?.includes(selectedNodeId)) ?? null
      : null),
    [document.paths, selectedNodeId],
  );
  const pathRunStateByStepId = useMemo(
    () => buildPathRunStateByStepId(document.paths),
    [document.paths],
  );
  const selectedEdge = document.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedEdgeFlowTitles = selectedEdge
    ? flowEdgeEndpointTitles(selectedEdge, nodesById)
    : null;
  const playbackPathId = playback.active ? playback.pathId : selectedPathId;
  const playbackSequence = useMemo(
    () => buildFlowPlaybackSequence({
      paths: document.paths,
      nodes: document.nodes,
      edges: document.edges,
      nodesById,
      selectedPathId: playbackPathId,
      selectedNodeId,
    }),
    [document.edges, document.nodes, document.paths, nodesById, playbackPathId, selectedNodeId],
  );
  const playbackStepCount = playbackSequence.stepIds.length;
  const playbackStepIndex = playbackStepCount
    ? Math.min(playback.stepIndex, playbackStepCount - 1)
    : 0;
  const playbackActiveStepId = playback.active
    ? playbackSequence.stepIds[playbackStepIndex] ?? null
    : null;
  const effectivePathRunStateByStepId = useMemo(() => {
    if (!playbackActiveStepId) return pathRunStateByStepId;
    const next = new Map(pathRunStateByStepId);
    next.set(playbackActiveStepId, 'current');
    return next;
  }, [pathRunStateByStepId, playbackActiveStepId]);
  const neighborhoodFocus = useMemo(
    () => ((neighborhoodFocusEnabled || playbackActiveStepId)
      ? buildFlowNeighborhoodFocus({
          nodes: document.nodes,
          edges: document.edges,
          selectedNodeIds: playbackActiveStepId ? [playbackActiveStepId] : selectedNodeIds,
        })
      : buildFlowNeighborhoodFocus()),
    [document.edges, document.nodes, neighborhoodFocusEnabled, playbackActiveStepId, selectedNodeIds],
  );
  const focusGhostedNodeIds = neighborhoodFocus.active ? neighborhoodFocus.ghostedNodeIds : null;
  const focusGhostedPathIds = useMemo(
    () => (neighborhoodFocus.active
      ? buildGhostedFlowPathIds(document.paths, neighborhoodFocus.visibleNodeIds)
      : null),
    [document.paths, neighborhoodFocus],
  );
  const focusModeCanActivate = selectedNodeIds.length > 0;
  const focusModeActive = neighborhoodFocusEnabled && neighborhoodFocus.active;
  const studioSelectionIds = selectedPath?.stepIds?.length ? selectedPath.stepIds : selectedNodeIds;
  const studioSelectionNodes = useMemo(() => {
    if (!studioSelectionIds?.length) return [];
    const ids = new Set(studioSelectionIds);
    return document.nodes.filter((node) => ids.has(node.id));
  }, [document.nodes, studioSelectionIds]);
  const studioSelectionEdges = useMemo(() => {
    if (!studioSelectionIds?.length) return [];
    const ids = new Set(studioSelectionIds);
    return document.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  }, [document.edges, studioSelectionIds]);
  const studioSelectedArtifactIds = useMemo(() => [...new Set(studioSelectionNodes
    .map((node) => node.artifactId ?? node.data?.artifactId)
    .filter(Boolean))],
  [studioSelectionNodes]);
  const studioSelectionTitle = selectedPath?.name
    || studioSelectionNodes.map((node) => flowNodeDisplayTitle(node, cardsById)).filter(Boolean).slice(0, 2).join(', ')
    || 'Selected exploration context';
  const studioSelectionReady = Boolean(studioContext?.studioId && studioSelectionNodes.length);
  const childStudioCreationReady = Boolean(studioContext?.studioId);

  const displayEdges = useMemo(
    () => document.edges.map((edge) => {
      const normalized = normalizeFlowEdgeForEditor(edge);
      if (!neighborhoodFocus.active) return normalized;
      const focusClass = neighborhoodFocus.activeEdgeIds.has(edge.id)
        ? 'flow-edge-focus-active'
        : 'flow-edge-focus-ghost';
      return {
        ...normalized,
        className: [normalized.className, focusClass].filter(Boolean).join(' '),
        data: {
          ...normalized.data,
          focusGhosted: neighborhoodFocus.ghostedEdgeIds.has(edge.id),
        },
      };
    }),
    [document.edges, neighborhoodFocus],
  );

  useEffect(() => {
    if (!selectedNodeIds.length) {
      setNeighborhoodFocusEnabled(false);
    }
  }, [selectedNodeIds.length]);

  const stopPlaybackTimer = useCallback(() => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  const advancePlayback = useCallback((mode = 'step') => {
    if (!playbackStepCount) return;
    setPlayback((current) => {
      const currentIndex = current.active ? current.stepIndex : null;
      const next = nextFlowPlaybackIndex(currentIndex, playbackStepCount);
      return {
        active: true,
        isPlaying: mode === 'play' && !next.complete,
        stepIndex: next.index,
        pathId: playbackSequence.pathId,
      };
    });
  }, [playbackSequence.pathId, playbackStepCount]);

  const playFlow = useCallback(() => {
    if (!playbackStepCount) return;
    setPlayback((current) => ({
      active: true,
      isPlaying: true,
      stepIndex: current.active ? Math.min(current.stepIndex, playbackStepCount - 1) : 0,
      pathId: playbackSequence.pathId,
    }));
  }, [playbackSequence.pathId, playbackStepCount]);

  const pauseFlow = useCallback(() => {
    stopPlaybackTimer();
    setPlayback((current) => ({ ...current, isPlaying: false }));
  }, [stopPlaybackTimer]);

  const resetFlowPlayback = useCallback(() => {
    stopPlaybackTimer();
    setPlayback({ active: false, isPlaying: false, stepIndex: 0, pathId: null });
  }, [stopPlaybackTimer]);

  const stepFlow = useCallback(() => {
    stopPlaybackTimer();
    advancePlayback('step');
  }, [advancePlayback, stopPlaybackTimer]);

  useEffect(() => {
    stopPlaybackTimer();
    if (!playback.isPlaying || !playbackStepCount) return undefined;
    playbackTimerRef.current = setInterval(() => {
      advancePlayback('play');
    }, FLOW_PLAYBACK_TICK_MS);
    return stopPlaybackTimer;
  }, [advancePlayback, playback.isPlaying, playbackStepCount, stopPlaybackTimer]);

  useEffect(() => {
    if (!onRegisterContextSnapshot || !document.flow) return undefined;
    const getter = () => ({
      title: document.flow.title,
      description: document.flow.description ?? '',
      nodes: document.nodes,
      edges: document.edges,
    });
    onRegisterContextSnapshot(getter);
    return () => onRegisterContextSnapshot(null);
  }, [document.flow, document.nodes, document.edges, onRegisterContextSnapshot]);

  useEffect(() => {
    if (!onRegisterFlush) return undefined;
    const getter = () => ({
      isDirty: document.isDirty,
      flushSave: document.flushSave,
    });
    onRegisterFlush(getter);
    return () => onRegisterFlush(null);
  }, [document.flushSave, document.isDirty, onRegisterFlush]);

  const focusCanvas = useCallback(() => {
    canvasRef.current?.focus();
  }, []);

  const checkpoint = useCallback(() => {
    undoRef.current.push({ nodes: document.nodes, edges: document.edges, paths: document.paths });
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current = [];
  }, [document.edges, document.nodes, document.paths]);

  const clearFlowSelection = useCallback(() => {
    if (!instance) return;
    instance.setNodes((nodes) => nodes.map((node) => (
      node.selected ? { ...node, selected: false } : node
    )));
    instance.setEdges((edges) => edges.map((edge) => (
      edge.selected ? { ...edge, selected: false } : edge
    )));
  }, [instance]);

  const applyNodeSelectionToFlow = useCallback((nodeIds) => {
    const nodeChanges = buildFlowNodeSelectionChanges(document.nodes, nodeIds);
    if (nodeChanges.length) {
      document.onNodesChange(nodeChanges);
    }
    const edgeChanges = document.edges
      .filter((edge) => edge.selected)
      .map((edge) => ({
        id: edge.id,
        type: 'select',
        selected: false,
      }));
    if (edgeChanges.length) {
      document.onEdgesChange(edgeChanges);
    }
  }, [document]);

  const commitSelectedNodeIds = useCallback((nodeIds) => {
    const nextIds = [...new Set(nodeIds.filter(Boolean))];
    pendingNodeSelectionRef.current = { ids: nextIds, startedAt: Date.now() };
    setSelectedEdgeId(null);
    setSelectedNodeId(nextIds[0] ?? null);
    setSelectedNodeIds(nextIds);
    onSelectedNodeIdsChange?.(nextIds);
    if (nextIds.length > 0) {
      setSelectedPathId(null);
    }
    applyNodeSelectionToFlow(nextIds);
  }, [applyNodeSelectionToFlow, onSelectedNodeIdsChange]);

  const selectPath = useCallback((pathId) => {
    if (!pathId) return;
    setSelectedPathId(pathId);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    onSelectedNodeIdsChange?.([]);
    clearFlowSelection();
    setInspectorOpen(true);
  }, [clearFlowSelection, onSelectedNodeIdsChange]);

  const applyPathPointerMove = useCallback((clientX, clientY) => {
    const drag = draggingPathRef.current;
    if (!drag) return;
    const dx = (clientX - drag.startMouseX) / drag.zoom;
    const dy = (clientY - drag.startMouseY) / drag.zoom;
    document.setNodes((nodes) => applyDeltaToPathSteps(
      nodes,
      drag.stepIds,
      dx,
      dy,
      drag.startPositions,
    ));
  }, [document]);

  const finishPathDrag = useCallback(() => {
    draggingPathRef.current = null;
  }, []);

  useEffect(() => {
    const onPointerMove = (event) => {
      if (!draggingPathRef.current) return;
      applyPathPointerMove(event.clientX, event.clientY);
    };
    const onPointerEnd = () => {
      finishPathDrag();
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [applyPathPointerMove, finishPathDrag]);

  const startPathMove = useCallback((hull, event) => {
    if (agentModeActive || event.button !== 0) return;
    const path = document.paths.find((candidate) => candidate.id === hull.pathId);
    if (!path?.stepIds?.length) return;
    event.preventDefault();
    event.stopPropagation();
    selectPath(path.id);
    const startPositions = new Map();
    for (const stepId of path.stepIds) {
      const node = document.nodes.find((candidate) => candidate.id === stepId);
      if (node?.position) {
        startPositions.set(stepId, { x: node.position.x, y: node.position.y });
      }
    }
    if (!startPositions.size) return;
    checkpoint();
    draggingPathRef.current = {
      pathId: path.id,
      stepIds: path.stepIds,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startPositions,
      zoom: instance?.getZoom?.() ?? 1,
    };
  }, [agentModeActive, checkpoint, document.nodes, document.paths, instance, selectPath]);

  const handleNewPath = useCallback(() => {
    if (!selectedNodeIds.length || selectedPathId) return;
    try {
      checkpoint();
      const result = createFlowPathFromSelection({
        paths: document.paths,
        selectedStepIds: selectedNodeIds,
      });
      document.setPaths(result.paths);
      selectPath(result.pathId);
    } catch {
      /* selection guard in controls */
    }
  }, [checkpoint, document, selectPath, selectedNodeIds, selectedPathId]);

  const viewportCenter = useCallback(() => {
    if (!instance) return { x: 80, y: 80 };
    const rect = globalThis.document?.getElementById('flow-editor-canvas')?.getBoundingClientRect();
    return instance.screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 400) / 2,
    });
  }, [instance]);

  const revealFlowNode = useCallback((nodeId, position = null) => {
    if (!nodeId) return;
    commitSelectedNodeIds([nodeId]);
    setInspectorOpen(true);
    if (position && instance?.setCenter) {
      const x = position.x + 120;
      const y = position.y + 60;
      void instance.setCenter(x, y, {
        zoom: Math.max(instance.getZoom?.() ?? 1, 0.85),
        duration: 400,
      });
    }
  }, [commitSelectedNodeIds, instance]);

  useEffect(() => {
    if (!pendingRevealStudioId) return;
    const existingNode = document.nodes.find((node) =>
      node.type === 'artifact'
      && node.data?.artifactType === 'studio'
      && (node.artifactId === pendingRevealStudioId || node.data?.artifactId === pendingRevealStudioId));
    if (existingNode) {
      revealFlowNode(existingNode.id, existingNode.position);
      setStudioActionStatus('Child Studio node revealed');
    } else {
      setStudioActionStatus('Child Studio is not on this exploration yet');
    }
    onStudioNodeRevealed?.(pendingRevealStudioId);
  }, [document.nodes, onStudioNodeRevealed, pendingRevealStudioId, revealFlowNode]);

  const buildStudioSelectionPayload = useCallback(() => ({
    title: studioSelectionTitle,
    focalQuestion: studioContext?.focalQuestion ?? '',
    artifactIds: studioSelectedArtifactIds,
    summary: studioSelectionNodes
      .map((node) => flowNodeDisplayTitle(node, cardsById))
      .filter(Boolean)
      .join('\n'),
    constraints: [{
      source: 'flow_selection',
      flowId,
      selectedPathId: selectedPath?.id ?? null,
      selectedNodeIds: studioSelectionNodes.map((node) => node.id),
      nodes: studioSelectionNodes.map((node) => ({
        id: node.id,
        type: node.type,
        title: flowNodeDisplayTitle(node, cardsById),
        artifactId: node.artifactId ?? node.data?.artifactId ?? null,
        localNodeType: node.data?.localNodeType ?? null,
      })),
      edges: studioSelectionEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ?? edge.data?.label ?? null,
      })),
    }],
    expectedOutputs: studioContext?.expectedOutputs ?? [],
  }), [
    cardsById,
    flowId,
    selectedPath?.id,
    studioContext,
    studioSelectedArtifactIds,
    studioSelectionEdges,
    studioSelectionNodes,
    studioSelectionTitle,
  ]);

  const projectChildStudioNode = useCallback((childCard, childOverview = null) => {
    const cardForNode = childCard ?? studioCardLikeFromOverview(childOverview);
    if (!cardForNode) {
      return {
        status: 'failed',
        reason: 'Child Studio created, but no canvas card or overview was returned.',
      };
    }
    const existingNode = findStudioNodeForCard(document.nodes, cardForNode);
    if (existingNode) {
      return {
        status: 'existing',
        nodeId: existingNode.id,
        position: existingNode.position,
      };
    }
    const sourceId = selectedPath?.stepIds?.at?.(-1) ?? studioSelectionNodes[0]?.id ?? null;
    const sourceNode = sourceId ? nodesById.get(sourceId) : null;
    const position = childStudioNodePosition(sourceNode, viewportCenter());
    const childNode = buildChildStudioNode(cardForNode, position);
    if (!childNode) {
      return {
        status: 'failed',
        reason: 'Child Studio created, but the Flow node could not be built.',
      };
    }
    checkpoint();
    document.setNodes((nodes) => [...nodes, childNode]);
    const edge = buildChildStudioEdge(sourceId, childNode.id);
    if (edge) {
      document.setEdges((edges) => [...edges, edge]);
    }
    return {
      status: childCard ? 'inserted' : 'inserted_from_overview',
      nodeId: childNode.id,
      position: childNode.position,
    };
  }, [
    checkpoint,
    document,
    nodesById,
    selectedPath,
    studioSelectionNodes,
    viewportCenter,
  ]);

  useEffect(() => {
    if (!pendingRestoreStudio?.studioId || document.status.loading) return;
    let cancelled = false;
    const { studioId, childCard = null, childOverview = null } = pendingRestoreStudio;
    const finish = () => {
      if (!cancelled) onRestoreStudioComplete?.(studioId);
    };
    const existingNode = document.nodes.find((node) =>
      node.type === 'artifact'
      && node.data?.artifactType === 'studio'
      && flowNodeStudioArtifactId(node) === studioId);
    if (existingNode) {
      revealFlowNode(existingNode.id, existingNode.position);
      setStudioActionStatus('Child Studio node revealed');
      finish();
      return () => { cancelled = true; };
    }
    const projection = projectChildStudioNode(childCard, childOverview);
    if (projection?.nodeId) {
      revealFlowNode(projection.nodeId, projection.position);
      setStudioActionStatus('Child Studio restored on this exploration');
      void document.flushSave().finally(finish);
    } else {
      setStudioActionStatus(projection?.reason || 'Child Studio could not be restored on this exploration');
      finish();
    }
    return () => { cancelled = true; };
  }, [
    document.nodes,
    document.status.loading,
    document.flushSave,
    onRestoreStudioComplete,
    pendingRestoreStudio,
    projectChildStudioNode,
    revealFlowNode,
  ]);

  const handleCreateStudioContextPacket = useCallback(async () => {
    if (!studioSelectionReady || !onCreateStudioContextPacket) return;
    setStudioActionStatus('Saving context...');
    try {
      await onCreateStudioContextPacket(buildStudioSelectionPayload());
      setStudioActionStatus('Context saved');
    } catch (error) {
      setStudioActionStatus(error.message || 'Context failed');
    }
  }, [buildStudioSelectionPayload, onCreateStudioContextPacket, studioSelectionReady]);

  const handleInvokeChildStudio = useCallback(async (draft = {}) => {
    if (!childStudioCreationReady || !onInvokeChildStudio) return;
    setStudioActionStatus('Creating child Studio...');
    try {
      const useSelection = draft.useSelection !== false;
      const selectionPayload = useSelection ? buildStudioSelectionPayload() : {
        title: 'New child Studio',
        focalQuestion: '',
        artifactIds: [],
        summary: '',
        constraints: [{
          source: 'flow_selection',
          flowId,
          selectedPathId: null,
          selectedNodeIds: [],
          nodes: [],
          edges: [],
        }],
        expectedOutputs: [],
      };
      const title = String(draft.title ?? '').trim()
        || (useSelection ? `${studioSelectionTitle} Studio` : `${studioContext?.studioTitle ?? 'Child'} Studio`);
      const result = await onInvokeChildStudio({
        ...selectionPayload,
        title,
        contextTitle: useSelection ? studioSelectionTitle : title,
        goal: String(draft.goal ?? '').trim()
          || studioContext?.focalQuestion
          || (useSelection ? studioSelectionTitle : title),
      });
      const projection = projectChildStudioNode(result?.childCard, result?.childOverview);
      if (projection.status === 'failed') {
        setStudioActionStatus(projection.reason || 'Child Studio created; recover it from the dashboard.');
        return;
      }
      revealFlowNode(projection.nodeId, projection.position);
      setStudioActionStatus(projection.status === 'existing'
        ? 'Child Studio node revealed'
        : projection.status === 'inserted_from_overview'
          ? 'Child Studio node created; card recoverable from dashboard'
          : 'Child Studio node created');
    } catch (error) {
      setStudioActionStatus(error.message || 'Child Studio failed');
    }
  }, [
    buildStudioSelectionPayload,
    childStudioCreationReady,
    flowId,
    onInvokeChildStudio,
    projectChildStudioNode,
    revealFlowNode,
    studioContext,
    studioSelectionTitle,
  ]);

  const openChildStudioDialog = useCallback(() => {
    setChildStudioDraft({
      title: studioSelectionNodes.length ? `${studioSelectionTitle} Studio` : `${studioContext?.studioTitle ?? 'Child'} Studio`,
      goal: studioContext?.focalQuestion ?? '',
      useSelection: studioSelectionNodes.length > 0,
    });
    setChildStudioDialogOpen(true);
  }, [studioContext, studioSelectionNodes.length, studioSelectionTitle]);

  const submitChildStudioDialog = useCallback((event) => {
    event.preventDefault();
    setChildStudioDialogOpen(false);
    void handleInvokeChildStudio(childStudioDraft);
  }, [childStudioDraft, handleInvokeChildStudio]);

  const handleDuplicatePath = useCallback(() => {
    const path = document.paths.find((candidate) => candidate.id === selectedPathId);
    if (!path) return;
    try {
      checkpoint();
      const result = duplicateFlowPath({
        path,
        nodes: document.nodes,
        edges: document.edges,
        paths: document.paths,
      });
      document.setPaths(result.paths);
      document.setNodes(result.nodes);
      document.setEdges(result.edges);
      selectPath(result.pathId);
    } catch {
      /* invalid path state */
    }
  }, [checkpoint, document, selectPath, selectedPathId]);

  const handleAddStepsToPath = useCallback(() => {
    const path = document.paths.find((candidate) => candidate.id === selectedPathId);
    if (!path) return;
    const addable = selectedNodeIds.filter((id) => !path.stepIds?.includes(id));
    if (!addable.length || agentModeActive) return;
    checkpoint();
    document.setPaths((paths) => addStepsToFlowPath({
      paths,
      pathId: selectedPathId,
      stepIds: addable,
    }));
  }, [agentModeActive, checkpoint, document, selectedNodeIds, selectedPathId]);

  const patchSelectedPathName = useCallback((name) => {
    if (!selectedPathId) return;
    document.setPaths((paths) => patchFlowPathName(paths, selectedPathId, name));
  }, [document, selectedPathId]);

  const handleStepRunStateChange = useCallback((pathId, stepId, runState) => {
    checkpoint();
    document.setPaths((paths) => patchPathStepRunState(paths, pathId, stepId, runState));
  }, [checkpoint, document]);

  const updateNode = useCallback((nodeId, patch, options = {}) => {
    if (options.checkpoint) checkpoint();
    document.setNodes((nodes) => nodes.map((node) => {
      if (node.id !== nodeId) return node;
      let next = node;
      if (patch.data) {
        next = patchFlowNodePresentation(next, patch.data);
      }
      if (patch.data?.showContent === false) {
        next = stripFlowNodeDimensions(next);
      }
      if (patch.width != null || patch.height != null) {
        next = patchFlowNodePresentation(next, {}, {
          width: patch.width ?? next.width,
          height: patch.height ?? next.height,
        });
      }
      return next;
    }));
  }, [checkpoint, document]);

  const toggleNodeContent = useCallback((node) => {
    if (!node) return;
    const linkedCard = node.type === 'artifact' ? cardsById.get(node.data?.cardId) : null;
    const showing = node.data?.showContent === true;
    if (showing) {
      updateNode(node.id, { data: { showContent: false } }, { checkpoint: true });
      return;
    }
    const size = defaultFlowNodePreviewSize(node, linkedCard);
    updateNode(node.id, {
      data: { showContent: true },
      width: size.width,
      height: size.height,
    }, { checkpoint: true });
  }, [cardsById, updateNode]);

  const addLocal = useCallback((position, localNodeType) => {
    checkpoint();
    document.setNodes((nodes) => [...nodes, newLocalFlowNode(position, { localNodeType })]);
  }, [checkpoint, document]);

  const setLocalNodeTypeColor = useCallback((typeId, color) => {
    document.setFlow((flow) => ({
      ...flow,
      localNodeTypeColors: patchFlowLocalNodeTypeColor(flow?.localNodeTypeColors, typeId, color),
    }));
  }, [document]);

  const addArtifact = useCallback((cardToAdd, position) => {
    const node = newArtifactFlowNode(cardToAdd, position);
    if (!node) return;
    checkpoint();
    document.setNodes((nodes) => [...nodes, node]);
  }, [checkpoint, document]);

  useEffect(() => {
    if (!pendingPromotedArtifactId) return;
    const existing = document.nodes.find((node) =>
      node.type === 'artifact'
      && (node.artifactId === pendingPromotedArtifactId || node.data?.artifactId === pendingPromotedArtifactId));
    if (existing) {
      revealFlowNode(existing.id, existing.position);
      onPromotedArtifactProjected?.(pendingPromotedArtifactId);
      return;
    }
    const cardToAdd = artifactCandidates.find((candidate) =>
      artifactRefIdForClusterCard(candidate) === pendingPromotedArtifactId);
    if (!cardToAdd) return;
    const position = viewportCenter();
    const node = newArtifactFlowNode(cardToAdd, position);
    if (!node) return;
    checkpoint();
    document.setNodes((nodes) => [...nodes, node]);
    revealFlowNode(node.id, node.position);
    onPromotedArtifactProjected?.(pendingPromotedArtifactId);
  }, [
    artifactCandidates,
    checkpoint,
    document,
    onPromotedArtifactProjected,
    pendingPromotedArtifactId,
    revealFlowNode,
    viewportCenter,
  ]);

  const removeEdgesById = useCallback((edgeIds) => {
    const ids = new Set(Array.isArray(edgeIds) ? edgeIds : [edgeIds]);
    const idsToRemove = [...ids].filter((id) => document.edges.some((edge) => edge.id === id));
    if (!idsToRemove.length) return;
    checkpoint();
    document.setEdges((edges) => removeFlowEdgesById(edges, idsToRemove));
    setSelectedEdgeId((current) => (current && idsToRemove.includes(current) ? null : current));
  }, [checkpoint, document]);

  const removeSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return;
    removeEdgesById([selectedEdgeId]);
  }, [removeEdgesById, selectedEdgeId]);

  const setSelectedEdgeFlowing = useCallback((flowing) => {
    if (!selectedEdgeId) return;
    checkpoint();
    document.setEdges((edges) => edges.map((edge) => {
      if (edge.id !== selectedEdgeId) return edge;
      return normalizeFlowEdgeForEditor({
        ...edge,
        data: { ...(edge.data ?? {}), flowing },
      });
    }));
  }, [checkpoint, document, selectedEdgeId]);

  const toggleSelectedEdgeDirection = useCallback(() => {
    if (!selectedEdgeId) return;
    checkpoint();
    document.setEdges((edges) => edges.map((edge) => {
      if (edge.id !== selectedEdgeId) return edge;
      const nextDirection = flowEdgeDirection(edge) === FLOW_EDGE_DIRECTION.reverse
        ? FLOW_EDGE_DIRECTION.forward
        : FLOW_EDGE_DIRECTION.reverse;
      return normalizeFlowEdgeForEditor({
        ...edge,
        data: { ...(edge.data ?? {}), flowDirection: nextDirection },
      });
    }));
  }, [checkpoint, document, selectedEdgeId]);

  const patchSelectedEdge = useCallback((nextEdge) => {
    if (!selectedEdgeId) return;
    checkpoint();
    document.setEdges((edges) => edges.map((edge) => (
      edge.id === selectedEdgeId ? normalizeFlowEdgeForEditor(nextEdge) : edge
    )));
  }, [checkpoint, document, selectedEdgeId]);

  const removeNodesById = useCallback((nodeIds) => {
    const ids = new Set(Array.isArray(nodeIds) ? nodeIds : [nodeIds]);
    const idsToRemove = [...ids].filter((id) => document.nodes.some((node) => node.id === id));
    if (!idsToRemove.length) return;
    checkpoint();
    const next = removeFlowNodesById(document.nodes, document.edges, idsToRemove);
    const normalizedPaths = normalizeFlowPaths(document.paths, next.nodes.map((node) => node.id));
    document.setNodes(next.nodes);
    document.setEdges(next.edges);
    document.setPaths(normalizedPaths);
    setSelectedNodeId((current) => (current && ids.has(current) ? null : current));
    setSelectedPathId((current) => (
      current && normalizedPaths.some((path) => path.id === current) ? current : null
    ));
    setSelectedEdgeId(null);
  }, [checkpoint, document]);

  const handleDeletePathOnly = useCallback((pathId) => {
    const path = document.paths.find((candidate) => candidate.id === pathId);
    if (!path || agentModeActive) return;
    if (!window.confirm(strings.flow.deleteFlowPathConfirm(path.name))) return;
    checkpoint();
    document.setPaths((paths) => deleteFlowPath(paths, pathId));
    setSelectedPathId((current) => (current === pathId ? null : current));
  }, [agentModeActive, checkpoint, document]);

  const handleDeletePathAndSteps = useCallback((pathId) => {
    const path = document.paths.find((candidate) => candidate.id === pathId);
    if (!path?.stepIds?.length || agentModeActive) return;
    const count = path.stepIds.length;
    if (!window.confirm(strings.flow.deleteFlowPathAndStepsConfirm(path.name, count))) return;
    removeNodesById(path.stepIds);
    setSelectedPathId(null);
  }, [agentModeActive, document.paths, removeNodesById]);

  const handleRemoveStepFromPath = useCallback((pathId, stepId) => {
    if (agentModeActive) return;
    checkpoint();
    let pathDeleted = false;
    document.setPaths((paths) => {
      const next = removeStepsFromFlowPath({ paths, pathId, stepIds: [stepId] });
      pathDeleted = !next.some((path) => path.id === pathId);
      return next;
    });
    if (pathDeleted) {
      setSelectedPathId((current) => (current === pathId ? null : current));
    }
  }, [agentModeActive, checkpoint, document]);

  const removeSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    removeNodesById([selectedNodeId]);
  }, [removeNodesById, selectedNodeId]);

  const handleNodesChange = useCallback((changes) => {
    const removeChanges = changes.filter((change) => change.type === 'remove');
    const otherChanges = changes.filter((change) => change.type !== 'remove');
    if (removeChanges.length) {
      removeNodesById(removeChanges.map((change) => change.id));
    }
    if (otherChanges.length) {
      document.onNodesChange(otherChanges);
    }
  }, [document, removeNodesById]);

  const handleEdgesChange = useCallback((changes) => {
    const removeChanges = changes.filter((change) => change.type === 'remove');
    const otherChanges = changes.filter((change) => change.type !== 'remove');
    if (removeChanges.length) {
      removeEdgesById(removeChanges.map((change) => change.id));
    }
    if (otherChanges.length) {
      document.onEdgesChange(otherChanges);
    }
  }, [document, removeEdgesById]);

  const handleEdgesDelete = useCallback((edgesToDelete) => {
    removeEdgesById(edgesToDelete.map((edge) => edge.id));
  }, [removeEdgesById]);

  const handleSelectionChange = useCallback(({ nodes, edges }) => {
    const pendingSelection = pendingNodeSelectionRef.current;
    if (edges.length > 0) {
      pendingNodeSelectionRef.current = null;
      setSelectedPathId(null);
      setSelectedEdgeId(edges[0]?.id ?? null);
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      onSelectedNodeIdsChange?.([]);
      return;
    }
    setSelectedEdgeId(null);
    const nodeIds = nodes.map((node) => node.id);
    if (pendingSelection) {
      if (selectionsHaveSameNodeIds(pendingSelection.ids, nodeIds)) {
        pendingNodeSelectionRef.current = null;
      } else if (Date.now() - pendingSelection.startedAt < FLOW_PENDING_SELECTION_GUARD_MS) {
        return;
      } else {
        pendingNodeSelectionRef.current = null;
      }
    }
    setSelectedNodeId(nodeIds[0] ?? null);
    setSelectedNodeIds(nodeIds);
    onSelectedNodeIdsChange?.(nodeIds);

    if (nodeIds.length > 0 && selectedPathId) {
      const path = document.paths.find((candidate) => candidate.id === selectedPathId);
      const hasOutsidePath = nodeIds.some((id) => !path?.stepIds?.includes(id));
      if (hasOutsidePath) return;
    }

    if (nodeIds.length > 0) {
      setSelectedPathId(null);
    }
  }, [document.paths, onSelectedNodeIdsChange, selectedPathId]);

  const handleNodeClick = useCallback((event, node) => {
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!additive) return;
    event.preventDefault();
    event.stopPropagation();
    commitSelectedNodeIds(resolveFlowNodeClickSelection(selectedNodeIds, node.id, true));
  }, [commitSelectedNodeIds, selectedNodeIds]);

  const revealInspectorForNode = useCallback((node) => {
    if (agentModeActive || !node?.id) return;
    setSelectedPathId(null);
    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
    setSelectedEdgeId(null);
    setInspectorOpen(true);
    onSelectedNodeIdsChange?.([node.id]);
  }, [agentModeActive, onSelectedNodeIdsChange]);

  const openStudioNode = useCallback(async (node, options = {}) => {
    if (node?.type !== 'artifact' || node.data?.artifactType !== 'studio') return false;
    const studioId = node.data?.artifactId ?? node.artifactId;
    if (!studioId || !onOpenStudioCard) return false;
    const opened = await onOpenStudioCard(studioId, options);
    if (!opened) {
      setStudioActionStatus('Studio card could not be opened');
      return false;
    }
    setStudioActionStatus(options.openPrimary === false ? 'Studio dashboard opened' : 'Child canvas opened');
    return true;
  }, [onOpenStudioCard]);

  const handleNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    event.stopPropagation();
    setNodeContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
      isStudio: node.type === 'artifact' && node.data?.artifactType === 'studio',
    });
  }, []);

  const beginRenameStudioNode = useCallback((node) => {
    if (node?.type !== 'artifact' || node.data?.artifactType !== 'studio') return;
    const studioId = flowNodeStudioArtifactId(node);
    if (!studioId || !onRenameStudioNode) {
      setStudioActionStatus(strings.flow.renameChildStudioUnavailable);
      return;
    }
    const currentTitle = flowArtifactNodeDisplayTitle(node.data, cardsById.get(node.data?.cardId));
    setStudioRenameDialog({ nodeId: node.id, title: currentTitle });
  }, [cardsById, onRenameStudioNode]);

  const submitRenameStudioDialog = useCallback(async (event) => {
    event.preventDefault();
    if (!studioRenameDialog) return;
    const node = document.nodes.find((candidate) => candidate.id === studioRenameDialog.nodeId);
    const title = studioRenameDialog.title.trim();
    const currentTitle = node
      ? flowArtifactNodeDisplayTitle(node.data, cardsById.get(node.data?.cardId))
      : '';
    if (!node || !title || title === currentTitle) {
      setStudioRenameDialog(null);
      return;
    }
    const studioId = flowNodeStudioArtifactId(node);
    if (!studioId || !onRenameStudioNode) {
      setStudioActionStatus(strings.flow.renameChildStudioUnavailable);
      setStudioRenameDialog(null);
      return;
    }
    try {
      await onRenameStudioNode(studioId, title);
      updateNode(node.id, {
        data: {
          title,
          displayFilename: title,
        },
      }, { checkpoint: true });
      setStudioActionStatus('Child Studio renamed');
    } catch (error) {
      setStudioActionStatus(error.message || strings.flow.renameChildStudioFailed);
    } finally {
      setStudioRenameDialog(null);
    }
  }, [
    cardsById,
    document.nodes,
    onRenameStudioNode,
    studioRenameDialog,
    updateNode,
  ]);

  const archiveStudioNode = useCallback(async (node) => {
    if (node?.type !== 'artifact' || node.data?.artifactType !== 'studio') return;
    const studioId = node.data?.artifactId ?? node.artifactId;
    if (!studioId || !onArchiveStudioNode) return;
    const currentTitle = flowArtifactNodeDisplayTitle(node.data, cardsById.get(node.data?.cardId));
    if (!window.confirm(`Archive ${currentTitle}?`)) return;
    await onArchiveStudioNode(studioId);
    checkpoint();
    document.setNodes((nodes) => nodes.filter((candidate) => candidate.id !== node.id));
    document.setEdges((edges) => edges.filter((edge) => edge.source !== node.id && edge.target !== node.id));
    commitSelectedNodeIds([]);
    setInspectorOpen(false);
    setStudioActionStatus('Child Studio archived');
  }, [cardsById, checkpoint, commitSelectedNodeIds, document, onArchiveStudioNode]);

  const revealInspectorForEdge = useCallback((edge) => {
    if (agentModeActive || !edge?.id) return;
    setSelectedPathId(null);
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setInspectorOpen(true);
    onSelectedNodeIdsChange?.([]);
  }, [agentModeActive, onSelectedNodeIdsChange]);

  const undo = () => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push({ nodes: document.nodes, edges: document.edges, paths: document.paths });
    document.setNodes(previous.nodes);
    document.setEdges(previous.edges.map((edge) => normalizeFlowEdgeForEditor(edge)));
    if (previous.paths) document.setPaths(previous.paths);
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedPathId(null);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push({ nodes: document.nodes, edges: document.edges, paths: document.paths });
    document.setNodes(next.nodes);
    document.setEdges(next.edges.map((edge) => normalizeFlowEdgeForEditor(edge)));
    if (next.paths) document.setPaths(next.paths);
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedPathId(null);
  };

  if (document.status.loading) return <div className="h-full flex items-center justify-center serif text-secondary">{strings.flow.loading}</div>;
  if (!document.flow) return <div className="h-full flex items-center justify-center serif text-danger">{document.status.error || strings.flow.unavailable}</div>;

  const editorContextValue = {
    cardsById,
    folderHandle,
    projectId: projectId ?? null,
    onRehydratePreview: onRehydratePreview ?? null,
    updateNode,
    checkpoint,
    agentScopedNodeIds: flowAgentScopeNodeIds ?? null,
    readOnly: agentModeActive,
    localNodeTypeColors: normalizeFlowLocalNodeTypeColors(document.flow?.localNodeTypeColors),
    setLocalNodeTypeColor,
    pathRunStateByStepId: effectivePathRunStateByStepId,
    focusGhostedNodeIds,
  };

  return (
    <FlowEditorProvider value={editorContextValue}>
    <div
      className="flex-1 min-h-0 h-full w-full flex bg-canvas text-primary"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {childStudioDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <form
            onSubmit={submitChildStudioDialog}
            className="w-full max-w-sm rounded-lg border border-border bg-surface p-4 shadow-xl"
          >
            <div className="sans text-[10px] uppercase tracking-wider text-muted">Create child Studio</div>
            <label className="sans mt-3 block text-[10px] uppercase tracking-wider text-muted">
              Name
              <input
                value={childStudioDraft.title}
                onChange={(event) => setChildStudioDraft((draft) => ({ ...draft, title: event.target.value }))}
                autoFocus
                className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm normal-case tracking-normal text-primary focus:outline-none focus:border-accent"
              />
            </label>
            <label className="sans mt-3 block text-[10px] uppercase tracking-wider text-muted">
              Goal / brief
              <textarea
                value={childStudioDraft.goal}
                onChange={(event) => setChildStudioDraft((draft) => ({ ...draft, goal: event.target.value }))}
                rows={3}
                className="mt-1 w-full resize-none rounded-md border border-border bg-canvas px-3 py-2 text-sm normal-case tracking-normal text-primary focus:outline-none focus:border-accent"
              />
            </label>
            <label className="sans mt-3 flex items-center gap-2 text-xs text-secondary">
              <input
                type="checkbox"
                checked={childStudioDraft.useSelection && studioSelectionNodes.length > 0}
                disabled={!studioSelectionNodes.length}
                onChange={(event) => setChildStudioDraft((draft) => ({ ...draft, useSelection: event.target.checked }))}
              />
              Use current selection as context
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setChildStudioDialogOpen(false)}
                className="sans rounded-full border border-border px-3 py-1.5 text-xs text-secondary hover:text-primary"
              >
                Cancel
              </button>
              <button type="submit" className="sans rounded-full bg-accent px-3 py-1.5 text-xs text-on-accent">
                Create Studio
              </button>
            </div>
          </form>
        </div>
      )}
      {studioRenameDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <form
            onSubmit={submitRenameStudioDialog}
            className="w-full max-w-sm rounded-lg border border-border bg-surface p-4 shadow-xl"
          >
            <div className="sans text-[10px] uppercase tracking-wider text-muted">
              {strings.flow.renameChildStudioTitle}
            </div>
            <label className="sans mt-3 block text-[10px] uppercase tracking-wider text-muted">
              Name
              <input
                value={studioRenameDialog.title}
                onChange={(event) => setStudioRenameDialog((dialog) => (
                  dialog ? { ...dialog, title: event.target.value } : dialog
                ))}
                autoFocus
                className="mt-1 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm normal-case tracking-normal text-primary focus:outline-none focus:border-accent"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStudioRenameDialog(null)}
                className="sans rounded-full border border-border px-3 py-1.5 text-xs text-secondary hover:text-primary"
              >
                Cancel
              </button>
              <button type="submit" className="sans rounded-full bg-accent px-3 py-1.5 text-xs text-on-accent">
                Rename
              </button>
            </div>
          </form>
        </div>
      )}
      {nodeContextMenu?.isStudio && (
        <div
          className="fixed z-50 min-w-40 rounded-md border border-border bg-surface p-1 shadow-xl"
          style={{ left: nodeContextMenu.x, top: nodeContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              const node = document.nodes.find((candidate) => candidate.id === nodeContextMenu.nodeId);
              setNodeContextMenu(null);
              void openStudioNode(node, { openPrimary: true });
            }}
            className="sans flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-primary hover:bg-surface-muted"
          >
            <Network size={13} />
            Open Child Canvas
          </button>
          <button
            type="button"
            onClick={() => {
              const node = document.nodes.find((candidate) => candidate.id === nodeContextMenu.nodeId);
              setNodeContextMenu(null);
              void openStudioNode(node, { openPrimary: false });
            }}
            className="sans flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-secondary hover:bg-surface-muted hover:text-primary"
          >
            <FileText size={13} />
            Open Studio Dashboard
          </button>
          <button
            type="button"
            onClick={() => {
              const node = document.nodes.find((candidate) => candidate.id === nodeContextMenu.nodeId);
              setNodeContextMenu(null);
              beginRenameStudioNode(node);
            }}
            className="sans flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-secondary hover:bg-surface-muted hover:text-primary"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              const node = document.nodes.find((candidate) => candidate.id === nodeContextMenu.nodeId);
              setNodeContextMenu(null);
              void archiveStudioNode(node);
            }}
            className="sans flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-danger hover:bg-danger-muted"
          >
            Archive
          </button>
        </div>
      )}
      {sidebarOpen && (
      <aside id="flow-sidebar" className="w-64 shrink-0 border-r border-border bg-surface flex flex-col min-h-0">
        <FlowSidebarSection
          title={strings.flow.stepsAndPathsSection}
          open={stepsSectionOpen}
          onToggle={() => setStepsSectionOpen((open) => !open)}
        >
          <div className="flex flex-col gap-2 p-3 border-b border-border">
            <FlowLocalNodeTypePicker onSelectType={(localNodeType) => addLocal(viewportCenter(), localNodeType)} />
            <FlowPathControls
              selectedPathId={selectedPathId}
              selectedStepIds={selectedNodeIds}
              paths={document.paths}
              onNewPath={handleNewPath}
              onDuplicatePath={handleDuplicatePath}
              onAddStepsToPath={handleAddStepsToPath}
              disabled={agentModeActive}
            />
          </div>
        </FlowSidebarSection>
        <FlowSidebarSection
          title={strings.flow.canvasArtifactsSection}
          open={artifactsSectionOpen}
          onToggle={() => setArtifactsSectionOpen((open) => !open)}
          className={artifactsSectionOpen ? 'flex flex-1 flex-col min-h-0' : 'shrink-0'}
        >
          <div className="px-3 pt-2 pb-2 border-b border-border shrink-0">
            <label className="relative block">
              <Search size={12} className="absolute left-2.5 top-2 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={strings.flow.artifactSearchPlaceholder}
                className="sans w-full rounded-full border border-border bg-canvas pl-8 pr-3 py-1.5 text-[11px] focus:outline-none focus:border-accent"
              />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
            {candidates.map((candidate) => {
              const typeStyle = getMutedStagingStyleForType(candidate.type);
              return (
              <div
                key={candidate.id}
                draggable
                onDragStart={(event) => event.dataTransfer.setData('application/x-canvas-artifact', candidate.id)}
                className="flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-grab transition-[filter] hover:brightness-[1.04]"
                style={typeStyle}
              >
                <div className="min-w-0 flex-1">
                  <div className="sans text-xs truncate leading-snug">{candidate.name}</div>
                  <div className="sans text-[8px] uppercase tracking-wider text-muted">{candidate.type}</div>
                </div>
                <button type="button" aria-label={`Add ${candidate.name}`} onClick={() => addArtifact(candidate, viewportCenter())} className="text-muted hover:text-accent p-0.5"><Plus size={12} /></button>
              </div>
              );
            })}
          </div>
        </FlowSidebarSection>
      </aside>
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="h-12 shrink-0 border-b border-border bg-surface flex items-center gap-2 px-3">
          <Workflow size={15} className="text-accent shrink-0" />
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="sans shrink-0 text-[10px] uppercase tracking-wider text-muted whitespace-nowrap">
              {strings.flow.explorationTitlePrefix}
            </span>
            <input value={document.flow.title} onChange={(event) => document.setFlow((flow) => ({ ...flow, title: event.target.value }))} className="serif min-w-0 flex-1 bg-transparent text-lg focus:outline-none" aria-label={strings.flow.nameLabel} />
          </div>
          <button type="button" onClick={undo} disabled={!undoRef.current.length} className="p-2 text-muted hover:text-primary disabled:opacity-30" aria-label="Undo"><Undo2 size={15} /></button>
          <button type="button" onClick={redo} disabled={!redoRef.current.length} className="p-2 text-muted hover:text-primary disabled:opacity-30" aria-label="Redo"><Redo2 size={15} /></button>
          {studioContext?.studioId && (
            <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
              <button
                type="button"
                onClick={handleCreateStudioContextPacket}
                disabled={!studioSelectionReady || !onCreateStudioContextPacket}
                aria-label="Create Studio context packet"
                title="Create Studio context packet"
                className="p-2 rounded-md border border-border text-muted transition hover:text-primary hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none"
              >
                <FileText size={14} />
              </button>
              <button
                type="button"
                onClick={openChildStudioDialog}
                disabled={!childStudioCreationReady || !onInvokeChildStudio}
                aria-label="Create child Studio"
                title="Create child Studio"
                className="p-2 rounded-md border border-border text-muted transition hover:text-primary hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none"
              >
                <Network size={14} />
              </button>
              {studioActionStatus && (
                <span className="sans max-w-32 truncate text-[10px] text-muted" title={studioActionStatus}>
                  {studioActionStatus}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
            <button
              type="button"
              onClick={playback.isPlaying ? pauseFlow : playFlow}
              disabled={!playbackStepCount}
              aria-label={playback.isPlaying ? strings.flow.pausePlayback : strings.flow.playPlayback}
              title={playback.isPlaying ? strings.flow.pausePlayback : strings.flow.playPlayback}
              className={`p-2 rounded-md border border-border transition disabled:opacity-30 disabled:pointer-events-none ${
                playback.isPlaying ? 'text-accent bg-accent-muted/30' : 'text-muted hover:text-primary hover:bg-surface-muted'
              }`}
            >
              {playback.isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              type="button"
              onClick={stepFlow}
              disabled={!playbackStepCount}
              aria-label={strings.flow.stepPlayback}
              title={strings.flow.stepPlayback}
              className="p-2 rounded-md border border-border text-muted transition hover:text-primary hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none"
            >
              <StepForward size={14} />
            </button>
            <button
              type="button"
              onClick={resetFlowPlayback}
              disabled={!playback.active}
              aria-label={strings.flow.resetPlayback}
              title={strings.flow.resetPlayback}
              className="p-2 rounded-md border border-border text-muted transition hover:text-primary hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNeighborhoodFocusEnabled((enabled) => !enabled)}
            disabled={!focusModeCanActivate}
            aria-pressed={focusModeActive}
            aria-label={focusModeActive ? strings.flow.disableNeighborhoodFocus : strings.flow.enableNeighborhoodFocus}
            title={
              focusModeCanActivate
                ? (focusModeActive ? strings.flow.disableNeighborhoodFocus : strings.flow.enableNeighborhoodFocus)
                : strings.flow.neighborhoodFocusDisabled
            }
            className={`p-2 transition disabled:opacity-30 disabled:hover:text-muted ${
              focusModeActive ? 'text-accent' : 'text-muted hover:text-primary'
            }`}
          >
            <Search size={15} />
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-expanded={sidebarOpen}
            aria-controls="flow-sidebar"
            title={sidebarOpen ? strings.flow.collapseFlowSidebar : strings.flow.expandFlowSidebar}
            className={`p-2 transition ${sidebarOpen ? 'text-accent' : 'text-muted hover:text-primary'}`}
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
          </button>
          <button
            type="button"
            onClick={() => setInspectorOpen((open) => !open)}
            aria-expanded={inspectorOpen}
            aria-controls="flow-inspector"
            title={inspectorOpen ? strings.flow.collapseInspector : strings.flow.expandInspector}
            className={`p-2 transition ${inspectorOpen ? 'text-accent' : 'text-muted hover:text-primary'}`}
          >
            {inspectorOpen ? <PanelRightClose size={15} /> : <PanelRight size={15} />}
          </button>
          <button
            type="button"
            onClick={() => { void handleSave(); }}
            disabled={!document.dirty || document.status.saving || flowClosing}
            className="sans flex items-center gap-1.5 rounded-full bg-accent text-on-accent px-3 py-1.5 text-xs disabled:opacity-40"
          >
            <Save size={13} />
            {document.status.saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {document.status.error && !document.status.conflict && (
          <div className="sans text-xs bg-danger-muted text-danger px-3 py-2 border-b border-danger-border">
            {formatFlowSaveError(document.status.error, strings.flow)}
          </div>
        )}
        {document.status.conflict && <div className="sans text-xs bg-warning-muted text-warning px-3 py-2 border-b border-warning">{strings.flow.conflictRemote} <button type="button" className="underline" onClick={() => void document.reload()}>{strings.flow.reloadServerCopy}</button></div>}
        {document.status.snapshotWarning && <div className="sans text-xs bg-warning-muted text-warning px-3 py-2 border-b border-warning">{strings.flow.snapshotWarning}</div>}
        <div
          id="flow-editor-canvas"
          ref={canvasRef}
          tabIndex={0}
          className="relative flex-1 min-h-0 w-full h-full outline-none"
          onPointerDown={focusCanvas}
        >
          <ReactFlow
            className="h-full w-full"
            nodes={document.nodes}
            edges={displayEdges}
            nodeTypes={NODE_TYPES}
            proOptions={{ hideAttribution: true }}
            onInit={setInstance}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onEdgesDelete={handleEdgesDelete}
            onConnect={(connection) => { checkpoint(); document.onConnect(connection); }}
            onSelectionChange={handleSelectionChange}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={(_, node) => revealInspectorForNode(node)}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeDoubleClick={(_, edge) => revealInspectorForEdge(edge)}
            onPaneClick={() => setNodeContextMenu(null)}
            onMoveEnd={(_, viewport) => document.setViewport(viewport)}
            onDrop={(event) => {
              event.preventDefault();
              const cardId = event.dataTransfer.getData('application/x-canvas-artifact');
              const candidate = artifactCandidates.find((item) => item.id === cardId);
              if (candidate && instance) addArtifact(candidate, instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
            }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
            defaultViewport={document.viewport}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            fitView={!document.nodes.length}
            deleteKeyCode={['Backspace', 'Delete']}
            multiSelectionKeyCode="Shift"
            selectionOnDrag
            colorMode="system"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border)" />
            <FlowPathHullOverlay
              hulls={pathHulls}
              highlightedPathId={selectedPathId}
              ghostedPathIds={focusGhostedPathIds}
              onHullSelect={selectPath}
              onStartPathMove={startPathMove}
              readOnly={agentModeActive}
            />
            <Panel position="bottom-right" className="m-3 flex flex-col items-end gap-2">
              {minimapOpen && (
                <div className="group flow-minimap-shell">
                  <MiniMap
                    nodeColor={(node) => node.type === 'artifact' ? 'var(--color-accent)' : 'var(--color-muted)'}
                    maskColor="var(--color-overlay-light)"
                  />
                  <button
                    type="button"
                    onClick={() => setMinimapOpen(false)}
                    aria-label={strings.flow.hideMinimap}
                    title={strings.flow.hideMinimap}
                    className="flow-minimap-minimize flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface/95 text-muted opacity-0 shadow-sm transition hover:text-primary group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Minimize2 size={12} strokeWidth={2} />
                  </button>
                </div>
              )}
              {!minimapOpen && (
                <button
                  type="button"
                  onClick={() => setMinimapOpen(true)}
                  aria-pressed={false}
                  aria-label={strings.flow.showMinimap}
                  title={strings.flow.showMinimap}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-surface text-muted shadow-[0_10px_24px_rgb(0_0_0_/_0.12)] transition hover:text-primary"
                >
                  <MapIcon size={14} strokeWidth={1.75} />
                </button>
              )}
            </Panel>
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </main>

      <aside
        id="flow-inspector"
        aria-label={strings.flow.expandInspector}
        className={`shrink-0 bg-surface flex flex-col min-h-0 transition-[width] duration-200 ease-out ${
          inspectorOpen
            ? 'w-72 border-l border-border'
            : 'w-0 overflow-hidden border-0 pointer-events-none'
        }`}
      >
        {inspectorOpen && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="sans text-[10px] uppercase tracking-wider text-muted mb-3">Inspector</div>
        {selectedPath ? (
          <>
            <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
              {strings.flow.pathInspector}
            </div>
            <FlowPathInspectorFields
              path={selectedPath}
              nodesById={nodesById}
              cardsById={cardsById}
              edges={document.edges}
              selectedStepIds={selectedNodeIds}
              onNameChange={patchSelectedPathName}
              onAddStepsToPath={handleAddStepsToPath}
              onStepRunStateChange={handleStepRunStateChange}
              onRemoveStepFromPath={handleRemoveStepFromPath}
              onDeletePathOnly={handleDeletePathOnly}
              onDeletePathAndSteps={handleDeletePathAndSteps}
              readOnly={agentModeActive}
            />
          </>
        ) : selectedEdge ? (
          <>
            <div className="sans text-[10px] uppercase tracking-wider text-muted mb-2">
              {strings.flow.inspectorConnection}
            </div>
            <div className="space-y-2 mb-4">
              <div>
                <div className="sans text-[10px] text-muted">{strings.flow.connectionFlowsFrom}</div>
                <div className="serif text-sm text-primary break-words">
                  {selectedEdgeFlowTitles?.fromTitle}
                </div>
              </div>
              <div>
                <div className="sans text-[10px] text-muted">{strings.flow.connectionFlowsTo}</div>
                <div className="serif text-sm text-primary break-words">
                  {selectedEdgeFlowTitles?.toTitle}
                </div>
              </div>
            </div>
            <FlowConnectionInspectorFields
              edge={selectedEdge}
              onPatch={patchSelectedEdge}
            />
            <label className="sans mb-3 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={flowEdgeIsFlowing(selectedEdge)}
                onChange={(event) => setSelectedEdgeFlowing(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
              />
              <span>
                <span className="block text-sm text-primary">{strings.flow.connectionFlow}</span>
                <span className="block text-xs text-muted mt-0.5">{strings.flow.connectionFlowHint}</span>
              </span>
            </label>
            <button
              type="button"
              onClick={toggleSelectedEdgeDirection}
              className="sans mb-4 w-full flex items-center justify-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-2 text-xs hover:border-accent transition"
            >
              <ArrowLeftRight size={13} />
              {strings.flow.reverseDirection}
            </button>
            <p className="sans text-xs text-muted mb-4">{strings.flow.reverseDirectionHint}</p>
            <button
              type="button"
              onClick={removeSelectedEdge}
              className={FLOW_INSPECTOR_REMOVE_BUTTON_CLASS}
            >
              <Trash2 size={13} />
              {strings.flow.removeConnection}
            </button>
            <p className="sans text-xs text-muted mt-3">{strings.flow.connectionHint}</p>
          </>
        ) : selectedNode?.type === 'local' ? (
          <>
            <button
              type="button"
              onClick={() => toggleNodeContent(selectedNode)}
              className="sans mb-3 w-full flex items-center justify-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-2 text-xs hover:border-accent transition"
            >
              {selectedNode.data?.showContent ? <EyeOff size={13} /> : <Eye size={13} />}
              {selectedNode.data?.showContent ? strings.flow.hideContent : strings.flow.showContent}
            </button>
            <label className="sans text-[10px] text-muted">{strings.flow.nodeType}</label>
            <div className="mt-1 mb-3 rounded-md border border-border bg-canvas p-1.5">
              <FlowLocalNodeTypeMenu
                ariaLabel={strings.flow.nodeType}
                selectedTypeId={selectedNode.data?.localNodeType}
                localNodeTypeColors={editorContextValue.localNodeTypeColors}
                onColorChange={setLocalNodeTypeColor}
                onSelect={(localNodeType) => updateNode(selectedNode.id, { data: { localNodeType } }, { checkpoint: true })}
              />
            </div>
            <label className="sans text-[10px] text-muted">{strings.flow.nodeActors}</label>
            <div className="mt-1 mb-3">
              <FlowNodeActorPicker
                ariaLabel={strings.flow.nodeActors}
                actors={selectedNode.data?.actors}
                onChange={(actors) => updateNode(selectedNode.id, { data: { actors } }, { checkpoint: true })}
              />
            </div>
            <label className="sans text-[10px] text-muted">Name</label>
            <input value={selectedNode.data?.title ?? ''} onChange={(event) => document.setNodes((nodes) => nodes.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, title: event.target.value } } : node))} className="sans mt-1 mb-3 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:border-accent" />
            <label className="sans text-[10px] text-muted">Description</label>
            <textarea value={selectedNode.data?.description ?? ''} onChange={(event) => document.setNodes((nodes) => nodes.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, description: event.target.value } } : node))} rows={5} className="sans mt-1 w-full resize-none rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:border-accent" />
            {selectedNodePath && (
              <>
                <label className="sans text-[10px] text-muted mt-3 block">{strings.flow.stepRunState}</label>
                <div className="mt-1 mb-3 rounded-md border border-border bg-canvas p-1.5">
                  <FlowStepRunStateMenu
                    ariaLabel={strings.flow.stepRunState}
                    selectedStateId={resolvePathStepRunState(selectedNodePath, selectedNode.id)}
                    onSelect={(runState) => handleStepRunStateChange(selectedNodePath.id, selectedNode.id, runState)}
                  />
                </div>
                <p className="sans text-xs text-muted mb-3">{strings.flow.stepRunStateHint}</p>
              </>
            )}
            <button
              type="button"
              onClick={removeSelectedNode}
              className={`${FLOW_INSPECTOR_REMOVE_BUTTON_CLASS} mt-4`}
            >
              <Trash2 size={13} />
              {strings.flow.removeNode}
            </button>
            <p className="sans text-xs text-muted mt-3">{strings.flow.nodeHint}</p>
          </>
        ) : selectedNode?.type === 'artifact' ? (
          <div>
            {selectedNode.data?.artifactType === 'studio' && (
              <div className="mb-3 space-y-2">
                <button
                  type="button"
                  onClick={() => { void openStudioNode(selectedNode, { openPrimary: true }); }}
                  className="sans w-full flex items-center justify-center gap-1.5 rounded-full border border-accent-border bg-accent-muted text-accent px-3 py-2 text-xs hover:bg-accent-muted/70 transition"
                >
                  <Network size={13} />
                  Open Child Canvas
                </button>
                <button
                  type="button"
                  onClick={() => { void openStudioNode(selectedNode, { openPrimary: false }); }}
                  className="sans w-full rounded-full border border-border px-3 py-1.5 text-xs text-secondary hover:text-primary"
                >
                  Open Studio Dashboard
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { beginRenameStudioNode(selectedNode); }}
                    className="sans rounded-full border border-border px-3 py-1.5 text-xs text-secondary hover:text-primary"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => { void archiveStudioNode(selectedNode); }}
                    className="sans rounded-full border border-danger-border px-3 py-1.5 text-xs text-danger hover:bg-danger-muted"
                  >
                    Archive
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => toggleNodeContent(selectedNode)}
              className="sans mb-3 w-full flex items-center justify-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-2 text-xs hover:border-accent transition"
            >
              {selectedNode.data?.showContent ? <EyeOff size={13} /> : <Eye size={13} />}
              {selectedNode.data?.showContent ? strings.flow.hideContent : strings.flow.showContent}
            </button>
            <div className="serif text-base">
              {flowArtifactNodeDisplayTitle(selectedNode.data, cardsById.get(selectedNode.data?.cardId))}
            </div>
            <label className="sans block text-[10px] text-muted mt-3">{strings.flow.nodeActors}</label>
            <div className="mt-1 mb-3">
              <FlowNodeActorPicker
                ariaLabel={strings.flow.nodeActors}
                actors={selectedNode.data?.actors}
                onChange={(actors) => updateNode(selectedNode.id, { data: { actors } }, { checkpoint: true })}
              />
            </div>
            <p className="sans text-xs text-muted mt-2">{strings.flow.artifactReferenceHint}</p>
            {selectedNodePath && (
              <>
                <label className="sans text-[10px] text-muted mt-3 block">{strings.flow.stepRunState}</label>
                <div className="mt-1 mb-3 rounded-md border border-border bg-canvas p-1.5">
                  <FlowStepRunStateMenu
                    ariaLabel={strings.flow.stepRunState}
                    selectedStateId={resolvePathStepRunState(selectedNodePath, selectedNode.id)}
                    onSelect={(runState) => handleStepRunStateChange(selectedNodePath.id, selectedNode.id, runState)}
                  />
                </div>
                <p className="sans text-xs text-muted mb-3">{strings.flow.stepRunStateHint}</p>
              </>
            )}
            <button
              type="button"
              onClick={removeSelectedNode}
              className={`${FLOW_INSPECTOR_REMOVE_BUTTON_CLASS} mt-4`}
            >
              <Trash2 size={13} />
              {strings.flow.removeNode}
            </button>
            <p className="sans text-xs text-muted mt-3">{strings.flow.nodeHint}</p>
          </div>
        ) : (
          <>
            <p className="sans text-xs text-muted mb-4">{strings.flow.selectNodeOrConnection}</p>
            <p className="sans text-xs text-muted mb-4">{strings.flow.pathWorkflowHint}</p>
            <label className="sans text-[10px] text-muted">{strings.flow.nodeTypeColors}</label>
            <div className="mt-1 rounded-md border border-border bg-canvas p-1.5">
              <FlowLocalNodeTypeMenu
                ariaLabel={strings.flow.nodeTypeColors}
                selectedTypeId={null}
                localNodeTypeColors={editorContextValue.localNodeTypeColors}
                onColorChange={setLocalNodeTypeColor}
                onSelect={() => {}}
              />
            </div>
          </>
        )}
        <div className="border-t border-border mt-6 pt-4">
          <label className="sans text-[10px] text-muted">{strings.flow.descriptionLabel}</label>
          <textarea value={document.flow.description ?? ''} onChange={(event) => document.setFlow((flow) => ({ ...flow, description: event.target.value }))} rows={5} className="sans mt-1 w-full resize-none rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
        </div>
        )}
      </aside>
    </div>
    </FlowEditorProvider>
  );
}

export function FlowEditor(props) {
  return <ReactFlowProvider><FlowEditorInner {...props} /></ReactFlowProvider>;
}

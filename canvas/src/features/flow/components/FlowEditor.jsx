import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Redo2, Save, Search, Trash2, Undo2, Workflow, Eye, EyeOff, ArrowLeftRight, PanelRight, PanelRightClose, Map as MapIcon } from 'lucide-react';
import { strings } from '../../../content/strings.js';
import { useFlowDocument } from '../hooks/useFlowDocument.js';
import {
  defaultFlowNodePreviewSize,
  flowNodeDisplayTitle,
  flowArtifactNodeDisplayTitle,
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
import { ArtifactFlowNode, LocalFlowNode } from './FlowNodes.jsx';
import { FlowConnectionInspectorFields } from './FlowConnectionInspectorFields.jsx';
import { FlowEditorProvider } from './FlowEditorContext.jsx';

const NODE_TYPES = { artifact: ArtifactFlowNode, local: LocalFlowNode };

const FLOW_INSPECTOR_REMOVE_BUTTON_CLASS =
  'sans w-full flex items-center justify-center gap-1.5 rounded-full border border-danger-border bg-danger-muted text-danger px-3 py-2 text-xs hover:bg-danger-border/40 transition';

function FlowEditorInner({
  card,
  artifactCandidates,
  folderHandle,
  onCardRefresh,
  onRehydratePreview,
  projectId,
  onRegisterContextSnapshot,
  onSelectedNodeIdsChange,
  flowAgentScopeNodeIds = null,
  agentModeActive = false,
}) {
  const flowId = card?.versions?.find((version) => version.version === card.pinnedVersion)?.flowId
    ?? card?.versions?.[0]?.artifactRef?.id;
  const document = useFlowDocument({ flowId, folderHandle, onCardRefresh });
  const [query, setQuery] = useState('');
  const [instance, setInstance] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(() => !agentModeActive);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const canvasRef = useRef(null);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const viewportSyncedRef = useRef(false);

  useEffect(() => {
    viewportSyncedRef.current = false;
  }, [flowId]);

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
  const selectedNode = document.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = document.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedEdgeFlowTitles = selectedEdge
    ? flowEdgeEndpointTitles(selectedEdge, nodesById)
    : null;

  const displayEdges = useMemo(
    () => document.edges.map((edge) => normalizeFlowEdgeForEditor(edge)),
    [document.edges],
  );

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
    if (agentModeActive) {
      setInspectorOpen(false);
    }
  }, [agentModeActive]);

  const focusCanvas = useCallback(() => {
    canvasRef.current?.focus();
  }, []);

  const checkpoint = useCallback(() => {
    undoRef.current.push({ nodes: document.nodes, edges: document.edges });
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current = [];
  }, [document.edges, document.nodes]);

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

  const addLocal = useCallback((position) => {
    checkpoint();
    document.setNodes((nodes) => [...nodes, newLocalFlowNode(position)]);
  }, [checkpoint, document]);

  const addArtifact = useCallback((cardToAdd, position) => {
    const node = newArtifactFlowNode(cardToAdd, position);
    if (!node) return;
    checkpoint();
    document.setNodes((nodes) => [...nodes, node]);
  }, [checkpoint, document]);

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
    document.setNodes(next.nodes);
    document.setEdges(next.edges);
    setSelectedNodeId((current) => (current && ids.has(current) ? null : current));
    setSelectedEdgeId(null);
  }, [checkpoint, document]);

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
    if (edges.length > 0) {
      setSelectedEdgeId(edges[0]?.id ?? null);
      setSelectedNodeId(null);
      onSelectedNodeIdsChange?.([]);
      return;
    }
    setSelectedEdgeId(null);
    const nodeIds = nodes.map((node) => node.id);
    setSelectedNodeId(nodeIds[0] ?? null);
    onSelectedNodeIdsChange?.(nodeIds);
  }, [onSelectedNodeIdsChange]);

  const viewportCenter = useCallback(() => {
    if (!instance) return { x: 80, y: 80 };
    const rect = globalThis.document?.getElementById('flow-editor-canvas')?.getBoundingClientRect();
    return instance.screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 400) / 2,
    });
  }, [instance]);

  const undo = () => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push({ nodes: document.nodes, edges: document.edges });
    document.setNodes(previous.nodes);
    document.setEdges(previous.edges.map((edge) => normalizeFlowEdgeForEditor(edge)));
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push({ nodes: document.nodes, edges: document.edges });
    document.setNodes(next.nodes);
    document.setEdges(next.edges.map((edge) => normalizeFlowEdgeForEditor(edge)));
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
  };

  if (document.status.loading) return <div className="h-full flex items-center justify-center serif text-secondary">Loading flow…</div>;
  if (!document.flow) return <div className="h-full flex items-center justify-center serif text-danger">{document.status.error || 'Flow unavailable'}</div>;

  const editorContextValue = {
    cardsById,
    folderHandle,
    projectId: projectId ?? null,
    onRehydratePreview: onRehydratePreview ?? null,
    updateNode,
    checkpoint,
    agentScopedNodeIds: flowAgentScopeNodeIds ?? null,
  };

  return (
    <FlowEditorProvider value={editorContextValue}>
    <div
      className="flex-1 min-h-0 h-full w-full flex bg-canvas text-primary"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col min-h-0">
        <div className="p-3 border-b border-border">
          <label className="relative block">
            <Search size={13} className="absolute left-2.5 top-2.5 text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search artifacts" className="sans w-full rounded-full border border-border bg-canvas pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-accent" />
          </label>
          <button type="button" onClick={() => addLocal(viewportCenter())} className="sans mt-2 w-full flex items-center justify-center gap-1.5 rounded-full bg-accent text-on-accent px-3 py-2 text-xs">
            <Plus size={13} /> New flow node
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {candidates.map((candidate) => (
            <div key={candidate.id} draggable onDragStart={(event) => event.dataTransfer.setData('application/x-canvas-artifact', candidate.id)} className="flex items-center gap-2 rounded-lg border border-transparent hover:border-border hover:bg-surface-muted px-2 py-2 cursor-grab">
              <div className="min-w-0 flex-1">
                <div className="serif text-sm truncate">{candidate.name}</div>
                <div className="sans text-[9px] uppercase tracking-wider text-muted">{candidate.type}</div>
              </div>
              <button type="button" aria-label={`Add ${candidate.name}`} onClick={() => addArtifact(candidate, viewportCenter())} className="text-muted hover:text-accent p-1"><Plus size={14} /></button>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="h-12 shrink-0 border-b border-border bg-surface flex items-center gap-2 px-3">
          <Workflow size={15} className="text-accent" />
          <input value={document.flow.title} onChange={(event) => document.setFlow((flow) => ({ ...flow, title: event.target.value }))} className="serif flex-1 min-w-0 bg-transparent text-lg focus:outline-none" aria-label="Flow name" />
          <button type="button" onClick={undo} disabled={!undoRef.current.length} className="p-2 text-muted hover:text-primary disabled:opacity-30" aria-label="Undo"><Undo2 size={15} /></button>
          <button type="button" onClick={redo} disabled={!redoRef.current.length} className="p-2 text-muted hover:text-primary disabled:opacity-30" aria-label="Redo"><Redo2 size={15} /></button>
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
          <button type="button" onClick={() => void document.save()} disabled={!document.dirty || document.status.saving} className="sans flex items-center gap-1.5 rounded-full bg-accent text-on-accent px-3 py-1.5 text-xs disabled:opacity-40"><Save size={13} />{document.status.saving ? 'Saving…' : 'Save'}</button>
        </div>
        {document.status.conflict && <div className="sans text-xs bg-warning-muted text-warning px-3 py-2 border-b border-warning">This flow changed elsewhere. <button type="button" className="underline" onClick={() => void document.reload()}>Reload server copy</button></div>}
        {document.status.snapshotWarning && <div className="sans text-xs bg-warning-muted text-warning px-3 py-2 border-b border-warning">Flow saved to the database; the folder snapshot will retry later.</div>}
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
            nodesDeletable
            edgesDeletable
            colorMode="system"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border)" />
            <Panel position="bottom-right" className="m-3 flex flex-col items-end gap-2">
              {minimapOpen && (
                <MiniMap
                  nodeColor={(node) => node.type === 'artifact' ? 'var(--color-accent)' : 'var(--color-muted)'}
                  maskColor="var(--color-overlay-light)"
                />
              )}
              <button
                type="button"
                onClick={() => setMinimapOpen((open) => !open)}
                aria-pressed={minimapOpen}
                aria-label={minimapOpen ? strings.flow.hideMinimap : strings.flow.showMinimap}
                title={minimapOpen ? strings.flow.hideMinimap : strings.flow.showMinimap}
                className={`flex h-[26px] w-[26px] items-center justify-center rounded-md border bg-surface text-muted shadow-[0_10px_24px_rgb(0_0_0_/_0.12)] transition hover:text-primary ${
                  minimapOpen ? 'border-accent/60 text-accent' : 'border-border'
                }`}
              >
                <MapIcon size={14} strokeWidth={1.75} />
              </button>
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
        {selectedEdge ? (
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
            <label className="sans text-[10px] text-muted">Name</label>
            <input value={selectedNode.data?.title ?? ''} onChange={(event) => document.setNodes((nodes) => nodes.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, title: event.target.value } } : node))} className="sans mt-1 mb-3 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:border-accent" />
            <label className="sans text-[10px] text-muted">Description</label>
            <textarea value={selectedNode.data?.description ?? ''} onChange={(event) => document.setNodes((nodes) => nodes.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, description: event.target.value } } : node))} rows={5} className="sans mt-1 w-full resize-none rounded-md border border-border bg-canvas px-3 py-2 text-sm focus:outline-none focus:border-accent" />
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
            <p className="sans text-xs text-muted mt-2">Live reference. Editing this flow will not change the source artifact.</p>
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
          <p className="sans text-xs text-muted">{strings.flow.selectNodeOrConnection}</p>
        )}
        <div className="border-t border-border mt-6 pt-4">
          <label className="sans text-[10px] text-muted">Flow description</label>
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

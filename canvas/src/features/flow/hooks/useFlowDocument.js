import { useCallback, useEffect, useRef, useState } from 'react';
import { addEdge, useEdgesState, useNodesState } from '@xyflow/react';
import { fetchFlow, flowStreamUrl, saveFlow } from '../api/flowApi.js';
import { flowSnapshotPath, writeFlowSnapshot } from '../api/flowSnapshot.js';
import { previewFromFlow, snapshotForSave, normalizeFlowNodeForEditor, normalizeFlowEdgeForEditor } from '../domain/flowDocument.js';

export function useFlowDocument({ flowId, folderHandle, onCardRefresh }) {
  const [flow, setFlow] = useState(null);
  const [nodes, setNodes, applyNodeChanges] = useNodesState([]);
  const [edges, setEdges, applyEdgeChanges] = useEdgesState([]);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [status, setStatus] = useState({ loading: true });
  const [dirty, setDirty] = useState(false);
  const savingRef = useRef(false);
  const editGenerationRef = useRef(0);
  const clientIdRef = useRef(crypto.randomUUID());
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const latestRef = useRef({ flow: null, nodes: [], edges: [], viewport });

  const markDirty = useCallback(() => {
    editGenerationRef.current += 1;
    setDirty(true);
  }, []);

  useEffect(() => {
    latestRef.current = { flow, nodes, edges, viewport };
    dirtyRef.current = dirty;
    revisionRef.current = flow?.revision ?? 0;
  }, [dirty, flow, nodes, edges, viewport]);

  const load = useCallback(async () => {
    setStatus({ loading: true });
    try {
      const loaded = await fetchFlow(flowId);
      setFlow(loaded);
      setNodes((loaded.nodes ?? []).map((node) => normalizeFlowNodeForEditor(node)));
      setEdges((loaded.edges ?? []).map((edge) => normalizeFlowEdgeForEditor(edge)));
      setViewport(loaded.viewport ?? { x: 0, y: 0, zoom: 1 });
      setDirty(false);
      setStatus({ loading: false });
    } catch (error) {
      setStatus({ loading: false, error: error.message });
    }
  }, [flowId, setEdges, setNodes]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const stream = new EventSource(flowStreamUrl(flowId));
    stream.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.clientId === clientIdRef.current) return;
        if (message.type === 'flow_deleted') {
          setStatus({ loading: false, error: 'This flow was deleted in another session.' });
          return;
        }
        if (Number(message.revision) <= revisionRef.current) return;
        if (dirtyRef.current || savingRef.current) {
          setStatus((current) => ({ ...current, conflict: true, remoteRevision: message.revision }));
          return;
        }
        void load();
      } catch {
        /* ignore malformed flow-only notifications */
      }
    };
    return () => stream.close();
  }, [flowId, load]);

  const save = useCallback(async () => {
    const current = latestRef.current;
    if (!current.flow || savingRef.current) return null;
    const savingGeneration = editGenerationRef.current;
    savingRef.current = true;
    setStatus({ saving: true });
    try {
      const snapshotPath = folderHandle ? flowSnapshotPath(current.flow) : current.flow.snapshotPath;
      const saved = await saveFlow(flowId, {
        ...snapshotForSave({ ...current.flow, snapshotPath }, current.nodes, current.edges, current.viewport),
        clientId: clientIdRef.current,
      });
      const snapshotResult = await writeFlowSnapshot(folderHandle, {
        ...saved,
        nodes: current.nodes,
        edges: current.edges,
        preview: previewFromFlow(current.nodes, current.edges, {
          description: current.flow?.description,
        }),
      });
      const changedDuringSave = editGenerationRef.current !== savingGeneration;
      setFlow((currentFlow) => changedDuringSave
        ? { ...currentFlow, revision: saved.revision, updatedAt: saved.updatedAt }
        : saved);
      setDirty(changedDuringSave);
      setStatus({
        saving: false,
        savedAt: Date.now(),
        snapshotWarning: folderHandle && !snapshotResult.ok ? snapshotResult.reason : null,
      });
      onCardRefresh?.(saved, current.nodes, current.edges);
      if (changedDuringSave) {
        setTimeout(() => { void save(); }, 50);
      }
      return saved;
    } catch (error) {
      setStatus({
        saving: false,
        error: error.message,
        conflict: error.status === 409,
      });
      return null;
    } finally {
      savingRef.current = false;
    }
  }, [flowId, folderHandle, onCardRefresh]);

  useEffect(() => {
    if (!dirty || status.loading || status.conflict) return undefined;
    const timer = setTimeout(() => { void save(); }, 900);
    return () => clearTimeout(timer);
  }, [dirty, save, status.conflict, status.loading]);

  const onNodesChange = useCallback((changes) => {
    applyNodeChanges(changes);
    if (changes.some((change) => change.type !== 'select')) markDirty();
  }, [applyNodeChanges, markDirty]);

  const onEdgesChange = useCallback((changes) => {
    applyEdgeChanges(changes);
    if (changes.some((change) => change.type !== 'select')) markDirty();
  }, [applyEdgeChanges, markDirty]);

  const onConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    setEdges((current) => addEdge({
      ...connection,
      id: crypto.randomUUID(),
      type: 'smoothstep',
      data: {
        connectionTypeId: '',
        connectionTypeCustom: '',
        properties: {},
      },
    }, current));
    markDirty();
  }, [markDirty, setEdges]);

  return {
    flow,
    setFlow: (updater) => { setFlow(updater); markDirty(); },
    nodes,
    setNodes: (updater) => { setNodes(updater); markDirty(); },
    edges,
    setEdges: (updater) => { setEdges(updater); markDirty(); },
    viewport,
    setViewport: (next) => { setViewport(next); markDirty(); },
    status,
    dirty,
    onNodesChange,
    onEdgesChange,
    onConnect,
    save,
    reload: load,
  };
}

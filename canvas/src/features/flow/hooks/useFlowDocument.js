import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { fetchFlow, flowStreamUrl, saveFlow } from '../api/flowApi.js';
import { strings } from '../../../content/strings.js';
import { flowSnapshotPath, writeFlowSnapshot } from '../api/flowSnapshot.js';
import {
  formatFlowLoadError,
  previewFromFlow,
  snapshotForSave,
  normalizeFlowNodeForEditor,
  normalizeFlowEdgeForEditor,
} from '../domain/flowDocument.js';
import {
  clearAutosaveTimer,
  FLOW_AUTOSAVE_DELAY_MS,
  FLOW_CHAINED_SAVE_DELAY_MS,
  FLOW_SAVE_RETRY_DELAY_MS,
  resolveUpdaterValue,
  runBoundedFlush,
  scheduleAutosave,
  syncFlowRevisionRefs,
} from './flowAutosave.js';

/**
 * Persistence reads `latestRef` only; React nodes/edges/flow are for render.
 * Mutations that should autosave must update `latestRef` synchronously before markDirty().
 * save() re-reads `latestRef.current` immediately before snapshotForSave and onCardRefresh.
 */
export function useFlowDocument({ flowId, folderHandle, onCardRefresh }) {
  const [flow, setFlow] = useState(null);
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [viewport, setViewportState] = useState({ x: 0, y: 0, zoom: 1 });
  const [status, setStatus] = useState({ loading: true });
  const [dirty, setDirty] = useState(false);
  const savingRef = useRef(false);
  const editGenerationRef = useRef(0);
  const clientIdRef = useRef(crypto.randomUUID());
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const latestRef = useRef({ flow: null, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
  const saveTimerRef = useRef(null);
  const pendingSaveRef = useRef(false);
  const statusRef = useRef(status);
  const mountedRef = useRef(true);
  const saveRef = useRef(async () => ({ saved: null }));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAutosaveTimer(saveTimerRef);
    };
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useLayoutEffect(() => {
    latestRef.current = {
      ...latestRef.current,
      flow,
      nodes,
      edges,
      viewport,
    };
  }, [flow, nodes, edges, viewport]);

  useEffect(() => {
    dirtyRef.current = dirty;
    revisionRef.current = flow?.revision ?? 0;
  }, [dirty, flow?.revision]);

  const patchStatus = useCallback((patch) => {
    if (!mountedRef.current) return;
    setStatus((current) => (typeof patch === 'function' ? patch(current) : patch));
  }, []);

  const canScheduleSave = useCallback(() => {
    if (!mountedRef.current) return false;
    const currentStatus = statusRef.current;
    return !currentStatus.loading && !currentStatus.conflict;
  }, []);

  const clearSaveTimer = useCallback(() => {
    clearAutosaveTimer(saveTimerRef);
  }, []);

  const scheduleSave = useCallback((delayMs = FLOW_AUTOSAVE_DELAY_MS) => {
    if (!mountedRef.current) return;
    scheduleAutosave({
      timerRef: saveTimerRef,
      delayMs,
      canSchedule: canScheduleSave,
      onFire: () => {
        void saveRef.current();
      },
    });
  }, [canScheduleSave]);

  const markDirty = useCallback(() => {
    editGenerationRef.current += 1;
    dirtyRef.current = true;
    if (mountedRef.current) setDirty(true);
    scheduleSave();
  }, [scheduleSave]);

  const updateNodes = useCallback((updater) => {
    const previous = latestRef.current.nodes;
    const next = resolveUpdaterValue(updater, previous);
    latestRef.current = { ...latestRef.current, nodes: next };
    setNodes(next);
    markDirty();
  }, [markDirty, setNodes]);

  const updateEdges = useCallback((updater) => {
    const previous = latestRef.current.edges;
    const next = resolveUpdaterValue(updater, previous);
    latestRef.current = { ...latestRef.current, edges: next };
    setEdges(next);
    markDirty();
  }, [markDirty, setEdges]);

  const updateFlow = useCallback((updater) => {
    const previous = latestRef.current.flow;
    const next = resolveUpdaterValue(updater, previous);
    latestRef.current = { ...latestRef.current, flow: next };
    setFlow(next);
    markDirty();
  }, [markDirty]);

  const updateViewport = useCallback((nextViewport) => {
    latestRef.current = { ...latestRef.current, viewport: nextViewport };
    setViewportState(nextViewport);
    markDirty();
  }, [markDirty]);

  const load = useCallback(async () => {
    clearSaveTimer();
    patchStatus({ loading: true });
    try {
      const loaded = await fetchFlow(flowId);
      const loadedNodes = (loaded.nodes ?? []).map((node) => normalizeFlowNodeForEditor(node));
      const loadedEdges = (loaded.edges ?? []).map((edge) => normalizeFlowEdgeForEditor(edge));
      const loadedViewport = loaded.viewport ?? { x: 0, y: 0, zoom: 1 };
      if (!mountedRef.current) return;
      latestRef.current = {
        flow: loaded,
        nodes: loadedNodes,
        edges: loadedEdges,
        viewport: loadedViewport,
      };
      setFlow(loaded);
      setNodes(loadedNodes);
      setEdges(loadedEdges);
      setViewportState(loadedViewport);
      dirtyRef.current = false;
      setDirty(false);
      patchStatus({ loading: false });
    } catch (error) {
      patchStatus({ loading: false, error: formatFlowLoadError(error.message, strings.flow) });
    }
  }, [clearSaveTimer, flowId, patchStatus, setEdges, setNodes]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const stream = new EventSource(flowStreamUrl(flowId));
    stream.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.clientId === clientIdRef.current) return;
        if (message.type === 'flow_deleted') {
          patchStatus({ loading: false, error: strings.flow.deletedElsewhere });
          return;
        }
        if (Number(message.revision) <= revisionRef.current) return;
        if (dirtyRef.current || savingRef.current) {
          patchStatus((current) => ({ ...current, conflict: true, remoteRevision: message.revision }));
          return;
        }
        void load();
      } catch {
        /* ignore malformed flow-only notifications */
      }
    };
    return () => stream.close();
  }, [flowId, load, patchStatus]);

  const save = useCallback(async (options = {}) => {
    const { force = false } = options;
    clearSaveTimer();
    if (!latestRef.current.flow) {
      return { saved: null, conflict: false, error: null };
    }
    if (!force && !dirtyRef.current) {
      return { saved: null, conflict: false, error: null };
    }
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return { saved: null, conflict: false, error: null };
    }

    const savingGeneration = editGenerationRef.current;
    savingRef.current = true;
    patchStatus((currentStatus) => ({ ...currentStatus, saving: true }));
    let needsFollowUp = false;
    try {
      const snapshot = latestRef.current;
      const snapshotPath = folderHandle ? flowSnapshotPath(snapshot.flow) : snapshot.flow.snapshotPath;
      const saved = await saveFlow(flowId, {
        ...snapshotForSave(
          { ...snapshot.flow, snapshotPath },
          snapshot.nodes,
          snapshot.edges,
          snapshot.viewport,
        ),
        clientId: clientIdRef.current,
      });
      const fresh = latestRef.current;
      const snapshotResult = await writeFlowSnapshot(folderHandle, {
        ...saved,
        nodes: fresh.nodes,
        edges: fresh.edges,
        preview: previewFromFlow(fresh.nodes, fresh.edges, {
          description: fresh.flow?.description,
        }),
      });
      syncFlowRevisionRefs(latestRef, revisionRef, saved);
      const changedDuringSave = editGenerationRef.current !== savingGeneration;
      if (mountedRef.current) {
        setFlow((currentFlow) => changedDuringSave
          ? { ...currentFlow, revision: saved.revision, updatedAt: saved.updatedAt }
          : saved);
        dirtyRef.current = changedDuringSave;
        setDirty(changedDuringSave);
        patchStatus({
          saving: false,
          savedAt: Date.now(),
          error: null,
          conflict: false,
          snapshotWarning: folderHandle && !snapshotResult.ok ? snapshotResult.reason : null,
        });
      } else {
        dirtyRef.current = changedDuringSave;
        if (!changedDuringSave && latestRef.current.flow) {
          latestRef.current = { ...latestRef.current, flow: saved };
        }
      }
      needsFollowUp = changedDuringSave;
      await onCardRefresh?.(saved, fresh.nodes, fresh.edges);
      return { saved, conflict: false, error: null };
    } catch (error) {
      const conflict = error.status === 409;
      patchStatus({
        saving: false,
        error: error.message,
        conflict,
      });
      if (!conflict && dirtyRef.current && mountedRef.current) {
        scheduleSave(FLOW_SAVE_RETRY_DELAY_MS);
      }
      return { saved: null, conflict, error };
    } finally {
      savingRef.current = false;
      if (mountedRef.current && (needsFollowUp || pendingSaveRef.current)) {
        pendingSaveRef.current = false;
        scheduleSave(FLOW_CHAINED_SAVE_DELAY_MS);
      } else {
        pendingSaveRef.current = false;
      }
    }
  }, [clearSaveTimer, flowId, folderHandle, onCardRefresh, patchStatus, scheduleSave]);

  saveRef.current = save;

  const flushSave = useCallback(async () => {
    clearSaveTimer();
    if (!latestRef.current.flow) {
      return { ok: true, conflict: false, error: null };
    }
    return runBoundedFlush({
      isActive: () => mountedRef.current,
      isDirty: () => dirtyRef.current,
      isSaving: () => savingRef.current,
      hasPending: () => pendingSaveRef.current,
      saveOnce: async () => {
        pendingSaveRef.current = false;
        return save({ force: true });
      },
    });
  }, [clearSaveTimer, save]);

  const isDirty = useCallback(() => dirtyRef.current, []);

  const onNodesChange = useCallback((changes) => {
    if (changes.every((change) => change.type === 'select')) {
      setNodes((current) => applyNodeChanges(changes, current));
      return;
    }
    updateNodes((current) => applyNodeChanges(changes, current));
  }, [setNodes, updateNodes]);

  const onEdgesChange = useCallback((changes) => {
    if (changes.every((change) => change.type === 'select')) {
      setEdges((current) => applyEdgeChanges(changes, current));
      return;
    }
    updateEdges((current) => applyEdgeChanges(changes, current));
  }, [setEdges, updateEdges]);

  const onConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    updateEdges((current) => addEdge({
      ...connection,
      id: crypto.randomUUID(),
      type: 'smoothstep',
      data: {
        connectionTypeId: '',
        connectionTypeCustom: '',
        properties: {},
      },
    }, current));
  }, [updateEdges]);

  return {
    flow,
    setFlow: updateFlow,
    nodes,
    setNodes: updateNodes,
    edges,
    setEdges: updateEdges,
    viewport,
    setViewport: updateViewport,
    status,
    dirty,
    isDirty,
    onNodesChange,
    onEdgesChange,
    onConnect,
    save,
    flushSave,
    scheduleSave,
    reload: load,
  };
}

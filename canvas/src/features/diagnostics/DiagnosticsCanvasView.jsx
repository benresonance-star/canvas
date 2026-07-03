import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  getArchitectureInputFeedSequences,
  getArchitectureNodeById,
  getArchitecturePipeById,
  ARCHITECTURE_PIPES,
} from '../../lib/architecture/index.js';
import { useDiagnosticsSimulation } from './hooks/useDiagnosticsSimulation.js';
import { useEdgeRouteAnchors } from './hooks/useEdgeRouteAnchors.js';
import { useConcentrateActionLayout } from './hooks/useConcentrateActionLayout.js';
import { useDiagnosticsGraphProjection } from './hooks/useDiagnosticsGraphProjection.js';
import { useDiagnosticsViewMode } from './hooks/useDiagnosticsViewMode.js';
import { DiagnosticsToolbar } from './components/DiagnosticsToolbar.jsx';
import { DiagnosticsStepPanel } from './components/DiagnosticsStepPanel.jsx';
import { DiagnosticsInspector } from './components/DiagnosticsInspector.jsx';
import { DiagnosticsFlowCanvas } from './components/DiagnosticsFlowCanvas.jsx';
import { strings } from '../../content/strings.js';

const DiagnosticsWebGLCanvas = lazy(() => import('./webgl/DiagnosticsWebGLCanvas.jsx').then((mod) => ({
  default: mod.DiagnosticsWebGLCanvas,
})));

function DiagnosticsCanvasShell({ onClose, runtime }) {
  const simulation = useDiagnosticsSimulation();
  const { routeAnchors: globalRouteAnchors, setRouteAnchor: setGlobalRouteAnchor, flushRouteAnchors } = useEdgeRouteAnchors();
  const actionLayout = useConcentrateActionLayout(simulation.action?.id, simulation.action);
  const {
    viewMode,
    toggleViewMode,
    setViewMode,
    concentrateEnabled,
    setConcentrateEnabled,
    toggleConcentrate,
  } = useDiagnosticsViewMode();
  const [hasOpened3d, setHasOpened3d] = useState(false);
  const edgeLabelInteractionLockRef = useRef(false);

  const is2dActive = viewMode === '2d';
  const is3dActive = viewMode === '3d';
  const shouldMount3d = hasOpened3d || is3dActive;

  useEffect(() => {
    if (viewMode === '3d') {
      setHasOpened3d(true);
    }
  }, [viewMode]);

  useEffect(() => {
    if (simulation.isOverviewMode) {
      setConcentrateEnabled(false);
    }
  }, [simulation.isOverviewMode, setConcentrateEnabled]);

  const lockEdgeLabelInteraction = useCallback(() => {
    edgeLabelInteractionLockRef.current = true;
  }, []);

  const useActionScopedAnchors = concentrateEnabled && is3dActive && !simulation.isOverviewMode;

  const routeAnchors = useMemo(() => {
    if (!useActionScopedAnchors) return globalRouteAnchors;
    return { ...globalRouteAnchors, ...actionLayout.edgeAnchors };
  }, [useActionScopedAnchors, globalRouteAnchors, actionLayout.edgeAnchors]);

  const setRouteAnchor = useCallback((edgeId, anchor) => {
    if (useActionScopedAnchors) {
      actionLayout.setEdgeAnchor(edgeId, anchor);
      return;
    }
    setGlobalRouteAnchor(edgeId, anchor);
  }, [useActionScopedAnchors, actionLayout.setEdgeAnchor, setGlobalRouteAnchor]);

  const releaseEdgeLabelInteractionLock = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        edgeLabelInteractionLockRef.current = false;
        flushRouteAnchors();
        actionLayout.flushLayout();
      });
    });
  }, [flushRouteAnchors, actionLayout.flushLayout]);

  const {
    projectedNodes,
    projectedEdges,
    reactFlowNodes,
    reactFlowEdges,
  } = useDiagnosticsGraphProjection({
    simulation,
    routeAnchors,
    setRouteAnchor,
    lockEdgeLabelInteraction,
    releaseEdgeLabelInteractionLock,
  });

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const onNodeClick = useCallback((_, node) => {
    if (edgeLabelInteractionLockRef.current) return;
    if (node.type === 'architectureLayer') return;
    simulation.selectNode(node.id);
  }, [simulation]);

  const onEdgeClick = useCallback((_, edge) => {
    if (edgeLabelInteractionLockRef.current) return;
    simulation.selectPipe(edge.id);
  }, [simulation]);

  const onPaneClick = useCallback(() => {
    if (edgeLabelInteractionLockRef.current) return;
    simulation.selectNode(null);
    simulation.selectPipe(null);
  }, [simulation]);

  const onSelectNode = useCallback((nodeId) => {
    if (edgeLabelInteractionLockRef.current) return;
    simulation.selectNode(nodeId);
  }, [simulation]);

  const onSelectPipe = useCallback((pipeId) => {
    if (edgeLabelInteractionLockRef.current) return;
    simulation.selectPipe(pipeId);
  }, [simulation]);

  const onClearSelection = useCallback(() => {
    simulation.selectNode(null);
    simulation.selectPipe(null);
  }, [simulation]);

  const inspectorNode = simulation.selectedNodeId
    ? getArchitectureNodeById(simulation.selectedNodeId)
    : null;
  const inspectorPipe = simulation.selectedPipeId
    ? getArchitecturePipeById(simulation.selectedPipeId)
    : null;
  const showInputSequences = Boolean(
    simulation.isOverviewMode
    && simulation.extendedFeedIn
    && inspectorNode,
  );
  const inputFeedSequences = useMemo(() => (
    showInputSequences && simulation.selectedNodeId
      ? getArchitectureInputFeedSequences(
        simulation.selectedNodeId,
        ARCHITECTURE_PIPES,
        getArchitectureNodeById,
      )
      : []
  ), [showInputSequences, simulation.selectedNodeId]);

  return (
    <div className="fixed inset-0 z-[85] bg-canvas flex flex-col pointer-events-auto">
      <DiagnosticsToolbar
        simulation={simulation}
        runtime={runtime}
        viewMode={viewMode}
        onToggleViewMode={toggleViewMode}
        concentrateEnabled={concentrateEnabled}
        onToggleConcentrate={toggleConcentrate}
        onClose={onClose}
      />
      <div className="flex flex-1 min-h-0">
        <div
          id="diagnostics-flow-canvas"
          className={`flex-1 min-w-0 relative${simulation.isOverviewMode ? ' diagnostics-overview-mode' : ''}`}
        >
          <div
            className={is2dActive ? 'diagnostics-view-layer diagnostics-view-layer--active' : 'diagnostics-view-layer diagnostics-view-layer--inactive'}
            aria-hidden={!is2dActive}
          >
            <ReactFlowProvider>
              <DiagnosticsFlowCanvas
                reactFlowNodes={reactFlowNodes}
                reactFlowEdges={reactFlowEdges}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                onPaneClick={onPaneClick}
              />
            </ReactFlowProvider>
          </div>
          {shouldMount3d && (
            <div
              className={is3dActive ? 'diagnostics-view-layer diagnostics-view-layer--active' : 'diagnostics-view-layer diagnostics-view-layer--inactive'}
              aria-hidden={!is3dActive}
            >
              <Suspense fallback={(
                <div className="absolute inset-0 flex items-center justify-center sans text-sm text-muted">
                  {strings.diagnostics.view3dLoading}
                </div>
              )}
              >
                <DiagnosticsWebGLCanvas
                  active={is3dActive}
                  concentrateEnabled={concentrateEnabled}
                  action={simulation.action}
                  savedNodeOverrides={actionLayout.nodeOverrides}
                  setNodeFlowCenter={actionLayout.setNodeFlowCenter}
                  flushConcentrateLayout={actionLayout.flushLayout}
                  projectedNodes={projectedNodes}
                  projectedEdges={projectedEdges}
                  onSelectNode={onSelectNode}
                  onSelectPipe={onSelectPipe}
                  onClearSelection={onClearSelection}
                  edgeLabelInteractionLockRef={edgeLabelInteractionLockRef}
                  setRouteAnchor={setRouteAnchor}
                  lockEdgeLabelInteraction={lockEdgeLabelInteraction}
                  releaseEdgeLabelInteractionLock={releaseEdgeLabelInteractionLock}
                  onSwitchTo2d={() => setViewMode('2d')}
                />
              </Suspense>
            </div>
          )}
        </div>
        <aside className="w-80 shrink-0 border-l border-border bg-surface flex flex-col min-h-0">
          <DiagnosticsStepPanel
            step={simulation.step}
            stepIndex={simulation.stepIndex}
            stepCount={simulation.stepCount}
            actionLabel={simulation.action?.label}
            isOverviewMode={simulation.isOverviewMode}
          />
          <DiagnosticsInspector
            node={inspectorNode}
            pipe={inspectorPipe}
            showInputSequences={showInputSequences}
            inputFeedSequences={inputFeedSequences}
            activePipes={
              simulation.isOverviewMode && simulation.selectedNodeId
                ? [...simulation.pathHighlight.pathEdgeIds]
                  .map((id) => getArchitecturePipeById(id))
                  .filter(Boolean)
                : simulation.step
                  ? simulation.step.edgeIds.map((id) => getArchitecturePipeById(id)).filter(Boolean)
                  : []
            }
          />
        </aside>
      </div>
      <p className="sans text-[9px] text-muted text-center py-1 border-t border-border">
        {strings.diagnostics.footerHint}
      </p>
    </div>
  );
}

export function DiagnosticsCanvasView({ onClose, runtime }) {
  return <DiagnosticsCanvasShell onClose={onClose} runtime={runtime} />;
}

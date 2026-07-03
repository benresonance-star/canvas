import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ARCHITECTURE_NODES, isOverviewAction } from '../../../lib/architecture/index.js';
import {
  buildDiagnosticsLayout3d,
  FLOW_TO_WORLD_SCALE,
  NODE_WORLD_HEIGHT,
  NODE_WORLD_WIDTH,
} from '../../../lib/architecture/diagnosticsLayout3d.js';
import { prepareConcentratedEdgeProjection } from '../../../lib/architecture/diagnosticsEdgeGeometry.js';
import { clearDiagnosticsGlassMaterialCache, getDiagnosticsLayerShelfMaterial } from './diagnosticsNodeGlassMaterial.js';
import { disableRaycast } from './diagnosticsWebGLRaycast.js';
import { clearDiagnosticsEdgeMaterialCache } from './diagnosticsEdgeMaterial.js';
import { clearDiagnosticsEdgeLabelTextureCache } from './diagnosticsEdgeLabelTexture.js';
import { clearDiagnosticsNodeLabelTextureCache } from './diagnosticsNodeLabelTexture.js';
import { clearDiagnosticsLayerLabelTextureCache, getDiagnosticsLayerLabelTexture, LAYER_LABEL_WORLD_HEIGHT, measureLayerLabelWorldWidth } from './diagnosticsLayerLabelTexture.js';
import { DiagnosticsWebGLNode } from './DiagnosticsWebGLNode.jsx';
import { DiagnosticsWebGLEdges } from './DiagnosticsWebGLEdges.jsx';
import { DiagnosticsWebGLWireLabels } from './DiagnosticsWebGLEdgeLabel.jsx';
import { DiagnosticsWebGLViewContext } from './DiagnosticsWebGLViewContext.jsx';
import { DiagnosticsWebGLZoomControls } from './DiagnosticsWebGLZoomControls.jsx';
import { DiagnosticsWebGLZoomActionsBridge } from './DiagnosticsWebGLZoomActionsBridge.jsx';
import { DiagnosticsConcentrateBridge } from './DiagnosticsConcentrateBridge.jsx';
import { DiagnosticsConcentrateContext } from './DiagnosticsConcentrateContext.jsx';
import { useDiagnosticsConcentrate } from './DiagnosticsConcentrateContext.jsx';
import { DiagnosticsWebGLFramePump } from './DiagnosticsWebGLFramePump.jsx';
import { computeDiagnosticsSceneBounds, computeDiagnosticsFitCameraHeight, getDiagnosticsOrbitDistanceLimits } from './diagnosticsWebGLCamera.js';
import { strings } from '../../../content/strings.js';

const MAX_DPR = 1;

/** Keep the camera above the diagram — limit tilt so cards stay readable. */
const CAMERA_MIN_POLAR_ANGLE = 0.08;
const CAMERA_MAX_POLAR_ANGLE = 0.35;

const ORBIT_MOUSE_BUTTONS = {
  LEFT: THREE.MOUSE.PAN,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};

const ORBIT_TOUCHES = {
  ONE: THREE.TOUCH.PAN,
  TWO: THREE.TOUCH.DOLLY,
};

class DiagnosticsWebGLErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('[DiagnosticsWebGL]', error);
    this.props.onError?.(error);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function WebGLContextGuard({ onContextLost, onContextRestored }) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (event) => {
      event.preventDefault();
      gl.setAnimationLoop(null);
      onContextLost?.();
    };
    const handleRestored = () => {
      onContextRestored?.();
    };
    canvas.addEventListener('webglcontextlost', handleLost, false);
    canvas.addEventListener('webglcontextrestored', handleRestored, false);
    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost, false);
      canvas.removeEventListener('webglcontextrestored', handleRestored, false);
    };
  }, [gl, onContextLost, onContextRestored]);

  return null;
}

const FLAT_ROTATION = [-Math.PI / 2, 0, 0];

function LayerShelf({ layer, worldZ, worldCenterX, width, depth }) {
  const material = useMemo(() => getDiagnosticsLayerShelfMaterial(layer).clone(), [layer]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      position={[worldCenterX, 0.005, worldZ]}
      rotation={FLAT_ROTATION}
      material={material}
      raycast={disableRaycast}
    >
      <planeGeometry args={[width, depth]} />
    </mesh>
  );
}

function LayerShelfTitle({ label, titleWorld }) {
  const texture = useMemo(() => getDiagnosticsLayerLabelTexture(label), [label]);
  const labelWidth = useMemo(() => measureLayerLabelWorldWidth(label), [label]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [texture]);

  useEffect(() => () => material.dispose(), [material]);

  const position = useMemo(
    () => [
      titleWorld.x + labelWidth / 2,
      titleWorld.y,
      titleWorld.z + LAYER_LABEL_WORLD_HEIGHT / 2,
    ],
    [labelWidth, titleWorld.x, titleWorld.y, titleWorld.z],
  );

  return (
    <mesh
      position={position}
      rotation={FLAT_ROTATION}
      material={material}
      renderOrder={2}
      raycast={disableRaycast}
    >
      <planeGeometry args={[labelWidth, LAYER_LABEL_WORLD_HEIGHT]} />
    </mesh>
  );
}

function ConcentratedSceneContent({
  projectedNodes,
  projectedEdges,
  baseLayout3d,
  onSelectNode,
  onSelectPipe,
  onClearSelection,
  edgeLabelInteractionLockRef,
  onAnchorChange,
  onEdgeLabelDragStart,
  onEdgeLabelDragEnd,
  onNodeDragStart,
  onNodeDragEnd,
  orbitControlsEnabled,
  zoomActionsRef,
  onContextLost,
  onContextRestored,
  concentrateEnabled,
  action,
  active,
  savedNodeOverrides,
  setNodeFlowCenter,
}) {
  const {
    layout3d,
    progress,
    visibleNodeIds,
    visibleEdgeIds,
    sceneBounds,
  } = useDiagnosticsConcentrate();

  const resolvedLayout3d = layout3d ?? baseLayout3d;

  const bounds = sceneBounds ?? computeDiagnosticsSceneBounds(baseLayout3d);
  const hideUnrelated = concentrateEnabled && progress > 0.04;
  const concentrateEditable = concentrateEnabled && progress > 0.95;

  const orbitLimits = useMemo(
    () => getDiagnosticsOrbitDistanceLimits(bounds.radius),
    [bounds.radius],
  );

  const edgesWithHandlers = useMemo(() => (
    projectedEdges.map((edge) => ({
      ...edge,
      onSelect: onSelectPipe,
    }))
  ), [projectedEdges, onSelectPipe]);

  const useConcentrateRouting = concentrateEnabled && progress > 0.04;

  const visibleEdges = useMemo(() => {
    const base = edgesWithHandlers.filter((edge) => !edge.hidden);
    const scoped = hideUnrelated
      ? base.filter((edge) => visibleEdgeIds.has(edge.id))
      : base;
    if (!useConcentrateRouting) return scoped;
    return scoped.map((edge) => prepareConcentratedEdgeProjection(edge, resolvedLayout3d));
  }, [edgesWithHandlers, hideUnrelated, resolvedLayout3d, useConcentrateRouting, visibleEdgeIds]);

  const visibleNodes = useMemo(() => {
    if (!hideUnrelated) return projectedNodes;
    return projectedNodes.filter((node) => visibleNodeIds.has(node.id));
  }, [hideUnrelated, projectedNodes, visibleNodeIds]);

  const handleNodeFlowCenterChange = useCallback((nodeId, center) => {
    setNodeFlowCenter?.(nodeId, center);
  }, [setNodeFlowCenter]);

  const handleNodeDragStart = useCallback(() => {
    onNodeDragStart?.();
  }, [onNodeDragStart]);

  const handleNodeDragEnd = useCallback(() => {
    onNodeDragEnd?.();
  }, [onNodeDragEnd]);

  const viewContext = useMemo(
    () => ({
      diagramRadius: bounds.radius,
      labelViewScale: computeDiagnosticsFitCameraHeight(bounds.radius),
    }),
    [bounds.radius],
  );

  return (
    <DiagnosticsWebGLViewContext.Provider value={viewContext}>
      <WebGLContextGuard
        onContextLost={onContextLost}
        onContextRestored={onContextRestored}
      />
      <color attach="background" args={['#0b0d12']} />
      <ambientLight intensity={0.75} />

      <OrbitControls
        makeDefault
        enabled={orbitControlsEnabled}
        enableZoom
        enableRotate={false}
        enableDamping={false}
        minDistance={orbitLimits.minDistance}
        maxDistance={orbitLimits.maxDistance}
        minPolarAngle={CAMERA_MIN_POLAR_ANGLE}
        maxPolarAngle={CAMERA_MAX_POLAR_ANGLE}
        mouseButtons={ORBIT_MOUSE_BUTTONS}
        touches={ORBIT_TOUCHES}
      />

      <DiagnosticsWebGLFramePump active={active} />

      <DiagnosticsWebGLZoomActionsBridge
        bounds={bounds}
        actionsRef={zoomActionsRef}
        active={active}
      />

      {!hideUnrelated && resolvedLayout3d.layerPlanes.map(({
        layer,
        label,
        worldZ,
        worldDepth,
        worldCenterX,
        worldWidth,
        titleWorld,
      }) => (
        <React.Fragment key={layer}>
          <LayerShelf
            layer={layer}
            worldZ={worldZ}
            worldCenterX={worldCenterX}
            width={worldWidth}
            depth={worldDepth * 0.96}
          />
          <LayerShelfTitle label={label} titleWorld={titleWorld} />
        </React.Fragment>
      ))}

      <DiagnosticsWebGLEdges edges={visibleEdges} layout3d={resolvedLayout3d} />

      <DiagnosticsWebGLWireLabels
        edges={visibleEdges}
        layout3d={resolvedLayout3d}
        onAnchorChange={onAnchorChange}
        onEdgeLabelDragStart={onEdgeLabelDragStart}
        onEdgeLabelDragEnd={onEdgeLabelDragEnd}
      />

      {visibleNodes.map((node) => {
        const entry = resolvedLayout3d.byNodeId.get(node.id);
        const world = entry?.world;
        if (!world) return null;
        return (
          <DiagnosticsWebGLNode
            key={node.id}
            node={node}
            worldPosition={world}
            flowCenter={entry?.flow ? { centerX: entry.flow.centerX, centerY: entry.flow.centerY } : undefined}
            draggable={concentrateEditable}
            onFlowCenterChange={handleNodeFlowCenterChange}
            onDragStart={handleNodeDragStart}
            onDragEnd={handleNodeDragEnd}
            onSelect={onSelectNode}
          />
        );
      })}

      <mesh
        position={[bounds.center.x, -0.02, bounds.center.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event) => {
          event.stopPropagation();
          if (edgeLabelInteractionLockRef.current) return;
          onClearSelection();
        }}
      >
        <planeGeometry args={[bounds.radius * 4, bounds.radius * 4]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </DiagnosticsWebGLViewContext.Provider>
  );
}

function SceneContent({
  projectedNodes,
  projectedEdges,
  baseLayout3d,
  concentrateEnabled,
  action,
  savedNodeOverrides,
  setNodeFlowCenter,
  onSelectNode,
  onSelectPipe,
  onClearSelection,
  edgeLabelInteractionLockRef,
  onAnchorChange,
  onEdgeLabelDragStart,
  onEdgeLabelDragEnd,
  onNodeDragStart,
  onNodeDragEnd,
  orbitControlsEnabled,
  zoomActionsRef,
  onContextLost,
  onContextRestored,
  active,
}) {
  const wasConcentratingRef = useRef(false);
  const [concentrateExitActive, setConcentrateExitActive] = useState(false);
  const idleLayoutRuntimeRef = useRef({ animating: false, progress: 0, layout3d: null });

  const overviewContext = useMemo(() => ({
    layout3d: baseLayout3d,
    progress: 0,
    concentrateActive: false,
    visibleNodeIds: new Set(),
    visibleEdgeIds: new Set(),
    sceneBounds: computeDiagnosticsSceneBounds(baseLayout3d),
    layoutRuntimeRef: idleLayoutRuntimeRef,
  }), [baseLayout3d]);

  const canConcentrate = Boolean(action && !isOverviewAction(action));

  useLayoutEffect(() => {
    if (concentrateEnabled) {
      wasConcentratingRef.current = true;
      setConcentrateExitActive(false);
      return;
    }
    if (wasConcentratingRef.current) {
      wasConcentratingRef.current = false;
      setConcentrateExitActive(true);
    }
  }, [concentrateEnabled]);

  useEffect(() => {
    setConcentrateExitActive(false);
  }, [action?.id]);

  const handleConcentrateSettled = useCallback(() => {
    setConcentrateExitActive(false);
  }, []);

  const animateConcentrate = canConcentrate && (concentrateEnabled || concentrateExitActive);

  const sceneContentProps = {
    projectedNodes,
    projectedEdges,
    baseLayout3d,
    action,
    active,
    savedNodeOverrides,
    setNodeFlowCenter,
    onSelectNode,
    onSelectPipe,
    onClearSelection,
    edgeLabelInteractionLockRef,
    onAnchorChange,
    onEdgeLabelDragStart,
    onEdgeLabelDragEnd,
    onNodeDragStart,
    onNodeDragEnd,
    orbitControlsEnabled,
    zoomActionsRef,
    onContextLost,
    onContextRestored,
  };

  if (!canConcentrate) {
    return (
      <DiagnosticsConcentrateContext.Provider value={overviewContext}>
        <ConcentratedSceneContent
          {...sceneContentProps}
          concentrateEnabled={false}
        />
      </DiagnosticsConcentrateContext.Provider>
    );
  }

  return (
    <DiagnosticsConcentrateBridge
      animate={animateConcentrate}
      concentrateEnabled={concentrateEnabled}
      action={action}
      baseLayout3d={baseLayout3d}
      savedNodeOverrides={savedNodeOverrides}
      onConcentrateSettled={handleConcentrateSettled}
    >
      <ConcentratedSceneContent
        {...sceneContentProps}
        concentrateEnabled={concentrateEnabled}
        savedNodeOverrides={savedNodeOverrides}
        setNodeFlowCenter={setNodeFlowCenter}
      />
    </DiagnosticsConcentrateBridge>
  );
}

export function DiagnosticsWebGLCanvas({
  active = true,
  concentrateEnabled = false,
  action = null,
  savedNodeOverrides = null,
  setNodeFlowCenter,
  flushConcentrateLayout,
  projectedNodes,
  projectedEdges,
  onSelectNode,
  onSelectPipe,
  onClearSelection,
  edgeLabelInteractionLockRef,
  setRouteAnchor,
  lockEdgeLabelInteraction,
  releaseEdgeLabelInteractionLock,
  onSwitchTo2d,
}) {
  const baseLayout3d = useMemo(() => buildDiagnosticsLayout3d(ARCHITECTURE_NODES), []);
  const zoomActionsRef = useRef(null);
  const [orbitControlsEnabled, setOrbitControlsEnabled] = useState(true);
  const [renderBlocked, setRenderBlocked] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const containerRef = useRef(null);

  const handleEdgeLabelDragStart = useCallback(() => {
    lockEdgeLabelInteraction();
    setOrbitControlsEnabled(false);
  }, [lockEdgeLabelInteraction]);

  const handleEdgeLabelDragEnd = useCallback(() => {
    releaseEdgeLabelInteractionLock();
    setOrbitControlsEnabled(true);
    flushConcentrateLayout?.();
  }, [releaseEdgeLabelInteractionLock, flushConcentrateLayout]);

  const handleNodeDragStart = useCallback(() => {
    setOrbitControlsEnabled(false);
  }, []);

  const handleNodeDragEnd = useCallback(() => {
    setOrbitControlsEnabled(true);
    flushConcentrateLayout?.();
  }, [flushConcentrateLayout]);

  useEffect(() => () => {
    clearDiagnosticsGlassMaterialCache();
    clearDiagnosticsEdgeMaterialCache();
    clearDiagnosticsNodeLabelTextureCache();
    clearDiagnosticsEdgeLabelTextureCache();
    clearDiagnosticsLayerLabelTextureCache();
  }, []);

  const handleContextLost = useCallback(() => {
    setCanvasKey((key) => key + 1);
  }, []);

  const handleContextRestored = useCallback(() => {
    setRenderBlocked(false);
    setCanvasKey((key) => key + 1);
  }, []);

  const handleCanvasError = useCallback(() => {
    setRenderBlocked(true);
  }, []);

  const retry3d = useCallback(() => {
    setRenderBlocked(false);
    setCanvasKey((key) => key + 1);
  }, []);

  const recoveryOverlay = (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-canvas/90 px-6 text-center">
      <div className="max-w-sm pointer-events-auto">
        <p className="sans text-sm text-secondary">{strings.diagnostics.view3dContextLost}</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={retry3d}
            className="sans text-xs px-3 py-1.5 rounded-md border border-border hover:bg-surface-muted text-primary"
          >
            {strings.diagnostics.view3dRetry}
          </button>
          <button
            type="button"
            onClick={onSwitchTo2d}
            className="sans text-xs px-3 py-1.5 rounded-md border border-accent bg-accent-muted text-accent"
          >
            {strings.diagnostics.view2d}
          </button>
        </div>
      </div>
    </div>
  );

  const handleZoomIn = useCallback(() => {
    zoomActionsRef.current?.zoomIn?.();
  }, []);

  const handleZoomOut = useCallback(() => {
    zoomActionsRef.current?.zoomOut?.();
  }, []);

  const handleFitView = useCallback(() => {
    zoomActionsRef.current?.fitView?.();
  }, []);

  const onDoubleClickReset = useCallback(() => {
    handleFitView();
  }, [handleFitView]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 diagnostics-webgl-shell"
      onDoubleClick={onDoubleClickReset}
    >
      {renderBlocked && recoveryOverlay}
      {!renderBlocked && (
        <DiagnosticsWebGLErrorBoundary
          resetKey={canvasKey}
          onError={handleCanvasError}
          fallback={recoveryOverlay}
        >
          <Canvas
            key={canvasKey}
            className="diagnostics-webgl-canvas"
            dpr={MAX_DPR}
            frameloop={active ? 'always' : 'never'}
            camera={{ fov: 42, near: 0.1, far: 200, position: [0, 5, 12] }}
            gl={{
              antialias: false,
              alpha: false,
              powerPreference: 'high-performance',
              stencil: false,
            }}
          >
            <SceneContent
              projectedNodes={projectedNodes}
              projectedEdges={projectedEdges}
              baseLayout3d={baseLayout3d}
              concentrateEnabled={concentrateEnabled}
              action={action}
              savedNodeOverrides={savedNodeOverrides}
              setNodeFlowCenter={setNodeFlowCenter}
              onSelectNode={onSelectNode}
              onSelectPipe={onSelectPipe}
              onClearSelection={onClearSelection}
              edgeLabelInteractionLockRef={edgeLabelInteractionLockRef}
              onAnchorChange={setRouteAnchor}
              onEdgeLabelDragStart={handleEdgeLabelDragStart}
              onEdgeLabelDragEnd={handleEdgeLabelDragEnd}
              onNodeDragStart={handleNodeDragStart}
              onNodeDragEnd={handleNodeDragEnd}
              orbitControlsEnabled={orbitControlsEnabled}
              zoomActionsRef={zoomActionsRef}
              onContextLost={handleContextLost}
              onContextRestored={handleContextRestored}
              active={active}
            />
          </Canvas>
        </DiagnosticsWebGLErrorBoundary>
      )}
      {!renderBlocked && (
        <DiagnosticsWebGLZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
        />
      )}
    </div>
  );
}

export {
  FLOW_TO_WORLD_SCALE,
  NODE_WORLD_HEIGHT,
  NODE_WORLD_WIDTH,
};

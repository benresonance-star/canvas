import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Grid, OrbitControls } from '@react-three/drei';
import { Box, Grid2X2, LocateFixed, Move3D, RotateCcw, Save, SunMedium } from 'lucide-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeModelStats } from '../loaders/computeModelStats.js';
import {
  resolveThreeDSourceInfo,
  useThreeDModelSource,
} from '../hooks/useThreeDModelSource.js';
import { ThreeDModelSummary } from './ThreeDModelSummary.jsx';
import { disposeObject3D } from '../utils/dispose.js';
import {
  cameraStateFromControls,
  normalizeThreeDViewerState,
} from '../utils/viewerState.js';
import {
  applySavedCameraState,
  fitPerspectiveCameraToCurrentView,
  fitPerspectiveCameraToDefaultView,
  syncOrbitControlsAfterCameraFit,
} from '../utils/cameraFit.js';
import { requestActionSync } from '../../../lib/actionSync.js';

const VIEWER_STATE_SYNC_DEBOUNCE_MS = 400;

function buildThreeDMetadata(
  version,
  sourceInfo,
  stats,
  status = 'ready',
  error = null,
  viewerStateOverride = null,
) {
  return {
    sourceFile: {
      ...sourceInfo.sourceFile,
      uploadedAt: version?.threeD?.sourceFile?.uploadedAt ?? sourceInfo.sourceFile.uploadedAt,
      url: sourceInfo.sourceFile.url ?? version?.objectUrl ?? null,
    },
    status,
    metadata: stats ?? version?.threeD?.metadata ?? {},
    viewerState: normalizeThreeDViewerState(
      viewerStateOverride ?? version?.threeD?.viewerState,
    ),
    annotations: version?.threeD?.annotations ?? [],
    ...(error ? { error } : {}),
  };
}

function applyViewerToggle(state, field) {
  if (field === 'displayMode') {
    return {
      ...state,
      displayMode: state.displayMode === 'wireframe' ? 'material' : 'wireframe',
    };
  }
  if (field === 'lightingMode') {
    const nextMode =
      state.lightingMode === 'studio' ? 'bright'
        : state.lightingMode === 'bright' ? 'soft'
          : 'studio';
    return {
      ...state,
      lightingMode: nextMode,
      showEnvironment: true,
    };
  }
  return { ...state, [field]: !state[field] };
}

function metadataMatches(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function applyCardUpdate(onUpdateCard, cardId, updates) {
  if (!onUpdateCard || !cardId) return;
  if (onUpdateCard.length >= 2) {
    onUpdateCard(cardId, updates);
  } else {
    onUpdateCard(updates);
  }
}

function lightingForMode(mode) {
  if (mode === 'bright') {
    return {
      ambient: 0.85,
      hemi: 1.25,
      key: 2.25,
      fill: 1.1,
      rim: 1.45,
    };
  }
  if (mode === 'soft') {
    return {
      ambient: 0.55,
      hemi: 0.8,
      key: 1.25,
      fill: 0.65,
      rim: 0.75,
    };
  }
  return {
    ambient: 0.65,
    hemi: 1,
    key: 1.75,
    fill: 0.9,
    rim: 1.1,
  };
}

function ThreeDModel({ sourceUrl, format, displayMode, onMetadata, onError, onObjectReady }) {
  const [object, setObject] = useState(null);
  const onMetadataRef = useRef(onMetadata);
  const onErrorRef = useRef(onError);
  const materialStateRef = useRef(new WeakMap());

  useEffect(() => {
    onMetadataRef.current = onMetadata;
  }, [onMetadata]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    let loaded = null;
    setObject(null);

    if (!sourceUrl || (format !== 'glb' && format !== 'gltf')) return undefined;

    const loader = new GLTFLoader();
    loader.load(
      sourceUrl,
      (gltf) => {
        if (cancelled) {
          disposeObject3D(gltf.scene);
          return;
        }
        loaded = gltf.scene;
        const stats = computeModelStats(loaded);
        setObject(loaded);
        onMetadataRef.current?.({
          ...stats,
          hasAnimations: Array.isArray(gltf.animations) && gltf.animations.length > 0,
          hasCameras: Array.isArray(gltf.cameras) && gltf.cameras.length > 0,
        });
      },
      undefined,
      (error) => {
        if (!cancelled) onErrorRef.current?.(error);
      },
    );

    return () => {
      cancelled = true;
      if (loaded) disposeObject3D(loaded);
    };
  }, [sourceUrl, format]);

  useEffect(() => {
    if (!object) return;
    object.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => {
        if (!materialStateRef.current.has(material)) {
          materialStateRef.current.set(material, {
            wireframe: Boolean(material.wireframe),
            transparent: Boolean(material.transparent),
            opacity: Number.isFinite(material.opacity) ? material.opacity : 1,
          });
        }
        const original = materialStateRef.current.get(material);
        material.wireframe = displayMode === 'wireframe';
        material.transparent = displayMode === 'xray' ? true : original.transparent;
        material.opacity = displayMode === 'xray' ? 0.38 : original.opacity;
        material.needsUpdate = true;
      });
    });
  }, [displayMode, object]);

  useEffect(() => {
    if (!object) {
      onObjectReady?.(null);
      return undefined;
    }
    onObjectReady?.(object);
    return () => onObjectReady?.(null);
  }, [object, onObjectReady]);

  if (!object) return null;
  return <primitive object={object} />;
}

const VIEWPORT_FIT_SIZE_THRESHOLD_PX = 4;

function ViewportCameraBridge({
  viewportSize,
  viewerState,
  fitNonce,
  modelReadyNonce,
  modelObjectRef,
  pendingFitModeRef,
  viewerKey,
  registerCameraSnapshot,
}) {
  const { camera, gl, setSize, invalidate } = useThree();
  const controlsRef = useRef(null);
  const applySavedCamera = Boolean(viewerState.cameraSaved);
  const viewportAspect = viewportSize.width / Math.max(viewportSize.height, 1);
  const initialFitDoneRef = useRef(false);
  const lastFittedViewportRef = useRef({ width: 0, height: 0 });
  const fitRequestRef = useRef({ fitNonce: 0, modelReadyNonce: 0, viewportKey: '' });

  useEffect(() => {
    registerCameraSnapshot?.(() => cameraStateFromControls(camera, controlsRef.current));
    return () => registerCameraSnapshot?.(null);
  }, [camera, registerCameraSnapshot]);

  useEffect(() => {
    initialFitDoneRef.current = false;
    lastFittedViewportRef.current = { width: 0, height: 0 };
    fitRequestRef.current = { fitNonce: 0, modelReadyNonce: 0, viewportKey: '' };
  }, [viewerKey]);

  const applyCameraFit = useCallback(() => {
    const object = modelObjectRef.current;
    if (!object || viewportSize.width < 16 || viewportSize.height < 16) return false;

    setSize(viewportSize.width, viewportSize.height);
    if (camera.isPerspectiveCamera) {
      camera.aspect = viewportAspect;
      camera.updateProjectionMatrix();
    }
    gl.setSize(viewportSize.width, viewportSize.height, false);

    const fitOptions = { viewportAspect };

    if (applySavedCamera) {
      applySavedCameraState(camera, controlsRef.current, viewerState.camera);
      return true;
    }

    const fitMode = pendingFitModeRef.current;
    const fitted = fitMode === 'preserve'
      ? fitPerspectiveCameraToCurrentView(camera, controlsRef.current, object, fitOptions)
      : fitPerspectiveCameraToDefaultView(camera, controlsRef.current, object, fitOptions);

    if (fitted) {
      syncOrbitControlsAfterCameraFit(controlsRef.current);
      if (fitMode === 'default') {
        pendingFitModeRef.current = 'preserve';
      }
      initialFitDoneRef.current = true;
      lastFittedViewportRef.current = {
        width: viewportSize.width,
        height: viewportSize.height,
      };
    }

    return fitted;
  }, [
    applySavedCamera,
    camera,
    gl,
    modelObjectRef,
    pendingFitModeRef,
    setSize,
    viewerState.camera,
    viewportAspect,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    const object = modelObjectRef.current;
    if (!object || viewportSize.width < 16 || viewportSize.height < 16) return undefined;

    const viewportKey = `${viewportSize.width}x${viewportSize.height}`;
    const request = fitRequestRef.current;
    const viewportChanged =
      viewportKey !== request.viewportKey
      && (
        Math.abs(viewportSize.width - lastFittedViewportRef.current.width) >= VIEWPORT_FIT_SIZE_THRESHOLD_PX
        || Math.abs(viewportSize.height - lastFittedViewportRef.current.height) >= VIEWPORT_FIT_SIZE_THRESHOLD_PX
      );
    const explicitFit = fitNonce !== request.fitNonce;
    const modelBecameReady = modelReadyNonce !== request.modelReadyNonce;

    if (!explicitFit && !modelBecameReady && !(initialFitDoneRef.current && viewportChanged)) {
      return undefined;
    }

    if (viewportChanged && initialFitDoneRef.current && !explicitFit && !modelBecameReady) {
      pendingFitModeRef.current = 'preserve';
    }

    request.fitNonce = fitNonce;
    request.modelReadyNonce = modelReadyNonce;
    request.viewportKey = viewportKey;

    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (cancelled) return;
      if (applyCameraFit()) {
        invalidate();
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    applyCameraFit,
    applySavedCamera,
    fitNonce,
    invalidate,
    modelObjectRef,
    modelReadyNonce,
    pendingFitModeRef,
    viewerState.camera,
    viewportSize.height,
    viewportSize.width,
  ]);

  return <OrbitControls ref={controlsRef} makeDefault enableDamping={false} />;
}

function WebGLContextGuard({ onContextLost }) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (event) => {
      event.preventDefault();
      gl.setAnimationLoop(null);
      onContextLost?.();
    };
    canvas.addEventListener('webglcontextlost', handleLost, false);
    return () => canvas.removeEventListener('webglcontextlost', handleLost, false);
  }, [gl, onContextLost]);

  return null;
}

function ThreeDScene({
  sourceUrl,
  format,
  viewerState,
  viewportSize,
  fitNonce,
  canvasKey,
  pendingFitModeRef,
  viewerKey,
  onMetadata,
  onError,
  onContextLost,
  registerCameraSnapshot,
}) {
  const lighting = lightingForMode(viewerState.lightingMode);
  const modelObjectRef = useRef(null);
  const [modelReadyNonce, setModelReadyNonce] = useState(0);

  const handleObjectReady = useCallback((object) => {
    modelObjectRef.current = object;
    if (object) {
      setModelReadyNonce((nonce) => nonce + 1);
    }
  }, []);

  if (viewportSize.width < 16 || viewportSize.height < 16) {
    return null;
  }

  return (
    <div className="absolute inset-0 min-h-0">
      <Canvas
        key={canvasKey}
        camera={{
          position: viewerState.camera.position,
          fov: viewerState.camera.fov ?? 45,
          near: viewerState.camera.near ?? 0.1,
          far: viewerState.camera.far ?? 5000,
        }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        className="bg-preview-bg"
        style={{
          width: viewportSize.width,
          height: viewportSize.height,
          display: 'block',
        }}
        resize={{ debounce: { scroll: 0, resize: 0 } }}
      >
      <WebGLContextGuard onContextLost={onContextLost} />
      <color attach="background" args={['#141414']} />
      <ambientLight intensity={lighting.ambient} />
      <hemisphereLight args={['#f8fafc', '#222222', lighting.hemi]} />
      <directionalLight
        position={[6, 8, 5]}
        intensity={lighting.key}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-5, 4, -3]} intensity={lighting.fill} color="#dbeafe" />
      <directionalLight position={[0, 6, -7]} intensity={lighting.rim} color="#fff7ed" />
      <Suspense fallback={null}>
        <ThreeDModel
          sourceUrl={sourceUrl}
          format={format}
          displayMode={viewerState.displayMode}
          onMetadata={onMetadata}
          onError={onError}
          onObjectReady={handleObjectReady}
        />
        {viewerState.showEnvironment && (
          <Environment
            preset={viewerState.lightingMode === 'bright' ? 'city' : 'studio'}
            background={false}
            environmentIntensity={viewerState.lightingMode === 'soft' ? 0.45 : 0.7}
          />
        )}
      </Suspense>
      {viewerState.showGrid && (
        <Grid
          infiniteGrid
          cellSize={1}
          sectionSize={5}
          fadeDistance={45}
          fadeStrength={1}
          cellColor="#777777"
          sectionColor="#9a9a9a"
        />
      )}
      {viewerState.showAxes && <axesHelper args={[2.5]} />}
      <ViewportCameraBridge
        viewportSize={viewportSize}
        viewerState={viewerState}
        fitNonce={fitNonce}
        modelReadyNonce={modelReadyNonce}
        modelObjectRef={modelObjectRef}
        pendingFitModeRef={pendingFitModeRef}
        viewerKey={viewerKey}
        registerCameraSnapshot={registerCameraSnapshot}
      />
      </Canvas>
    </div>
  );
}

function ThreeDToolbar({
  viewerState,
  status,
  onToggle,
  onFit,
  onReset,
  onSave,
  compact = false,
}) {
  const buttonClass = (active = false) =>
    `inline-flex items-center justify-center rounded border px-2 py-1 transition ${
      active
        ? 'border-accent bg-accent text-on-accent'
        : 'border-border bg-surface text-secondary hover:text-primary hover:bg-surface-muted'
    }`;

  return (
    <div className={`sans shrink-0 flex items-center justify-between gap-2 border-b border-border bg-surface ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted truncate">{status}</div>
      <div className="flex items-center gap-1">
        <button type="button" title="Reset view" className={buttonClass()} onClick={onReset}>
          <RotateCcw size={compact ? 12 : 14} strokeWidth={1.7} />
        </button>
        <button type="button" title="Fit to model" className={buttonClass()} onClick={onFit}>
          <LocateFixed size={compact ? 12 : 14} strokeWidth={1.7} />
        </button>
        <button type="button" title="Toggle grid" className={buttonClass(viewerState.showGrid)} onClick={() => onToggle('showGrid')}>
          <Grid2X2 size={compact ? 12 : 14} strokeWidth={1.7} />
        </button>
        <button type="button" title="Toggle axes" className={buttonClass(viewerState.showAxes)} onClick={() => onToggle('showAxes')}>
          <Move3D size={compact ? 12 : 14} strokeWidth={1.7} />
        </button>
        <button type="button" title={`Lighting: ${viewerState.lightingMode}`} className={buttonClass(viewerState.showEnvironment)} onClick={() => onToggle('lightingMode')}>
          <SunMedium size={compact ? 12 : 14} strokeWidth={1.7} />
        </button>
        <button type="button" title="Toggle wireframe" className={buttonClass(viewerState.displayMode === 'wireframe')} onClick={() => onToggle('displayMode')}>
          <Box size={compact ? 12 : 14} strokeWidth={1.7} />
        </button>
        {!compact && (
          <button type="button" title="Save view" className={buttonClass()} onClick={onSave}>
            <Save size={14} strokeWidth={1.7} />
          </button>
        )}
      </div>
    </div>
  );
}

export function ThreeDArtifactViewer({
  card,
  version,
  onUpdateCard,
  projectId = null,
  folderHandle = null,
  compact = false,
  showToolbar = true,
  layoutKey = '',
}) {
  const sourceInfo = useThreeDModelSource(version, { folderHandle });
  const [viewerState, setViewerState] = useState(() =>
    normalizeThreeDViewerState(card?.threeDViewerState ?? version?.threeD?.viewerState),
  );
  const [fitNonce, setFitNonce] = useState(0);
  const [canvasKey, setCanvasKey] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const cameraSnapshotRef = useRef(null);
  const viewerStateRef = useRef(viewerState);
  const viewerStateSyncTimerRef = useRef(null);
  const viewportRef = useRef(null);
  const pendingFitModeRef = useRef('default');
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const prevLayoutKeyRef = useRef(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;

    const syncViewportSize = () => {
      const width = Math.max(1, Math.floor(el.clientWidth));
      const height = Math.max(1, Math.floor(el.clientHeight));
      setViewportSize((prev) => (
        prev.width === width && prev.height === height
          ? prev
          : { width, height }
      ));
    };

    syncViewportSize();
    const observer = new ResizeObserver(syncViewportSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sourceInfo.sourceUrl, loadError]);

  useEffect(() => {
    viewerStateRef.current = viewerState;
  }, [viewerState]);

  useEffect(() => () => {
    if (viewerStateSyncTimerRef.current) {
      clearTimeout(viewerStateSyncTimerRef.current);
    }
  }, []);

  useEffect(() => {
    setViewerState(normalizeThreeDViewerState(card?.threeDViewerState ?? version?.threeD?.viewerState));
    pendingFitModeRef.current = 'default';
  }, [card?.id, version?.version]);

  useEffect(() => {
    setLoadError(null);
  }, [card?.id, sourceInfo.sourceUrl, version?.version]);

  useEffect(() => {
    if (!layoutKey) return;
    if (prevLayoutKeyRef.current === null) {
      prevLayoutKeyRef.current = layoutKey;
      return;
    }
    if (prevLayoutKeyRef.current === layoutKey) return;
    prevLayoutKeyRef.current = layoutKey;
    pendingFitModeRef.current = 'preserve';
    setFitNonce((nonce) => nonce + 1);
  }, [layoutKey]);

  const handleContextLost = useCallback(() => {
    setLoadError(null);
    setCanvasKey((key) => key + 1);
    setFitNonce((nonce) => nonce + 1);
  }, []);

  const scheduleViewerStateSync = useCallback((resolvedProjectId) => {
    if (!resolvedProjectId) return;
    if (viewerStateSyncTimerRef.current) {
      clearTimeout(viewerStateSyncTimerRef.current);
    }
    viewerStateSyncTimerRef.current = setTimeout(() => {
      viewerStateSyncTimerRef.current = null;
      void requestActionSync('structuralChange', { projectId: resolvedProjectId });
    }, VIEWER_STATE_SYNC_DEBOUNCE_MS);
  }, []);

  const patchVersionThreeD = useCallback((threeDPatch) => {
    if (!card?.id || !version?.version || !onUpdateCard) return;
    const nextThreeD = {
      ...(version.threeD ?? {}),
      ...threeDPatch,
    };
    if (metadataMatches(version.threeD, nextThreeD)) return;
    applyCardUpdate(onUpdateCard, card.id, {
      versions: (card.versions ?? []).map((candidate) =>
        candidate.version === version.version
          ? { ...candidate, threeD: nextThreeD }
          : candidate,
      ),
    });
  }, [card, onUpdateCard, version]);

  const persistViewerState = useCallback((nextState, { includeCamera = false } = {}) => {
    const camera = includeCamera ? cameraSnapshotRef.current?.() : null;
    const normalized = normalizeThreeDViewerState({
      ...nextState,
      ...(camera ? { camera } : {}),
    });
    applyCardUpdate(onUpdateCard, card?.id, { threeDViewerState: normalized });
    patchVersionThreeD({
      viewerState: normalized,
      annotations: version?.threeD?.annotations ?? [],
    });
    scheduleViewerStateSync(projectId ?? card?.projectId ?? null);
    return normalized;
  }, [
    card?.id,
    card?.projectId,
    onUpdateCard,
    patchVersionThreeD,
    projectId,
    scheduleViewerStateSync,
    version?.threeD?.annotations,
  ]);

  const handleMetadata = useCallback((stats) => {
    patchVersionThreeD(buildThreeDMetadata(
      version,
      sourceInfo,
      stats,
      'ready',
      null,
      viewerStateRef.current,
    ));
  }, [patchVersionThreeD, sourceInfo, version]);

  const handleError = useCallback((error) => {
    const message = error?.message || 'Could not load model';
    setLoadError(message);
    patchVersionThreeD(buildThreeDMetadata(
      version,
      sourceInfo,
      null,
      'failed',
      message,
      viewerStateRef.current,
    ));
  }, [patchVersionThreeD, sourceInfo, version]);

  const handleToggle = useCallback((field) => {
    setViewerState((state) => {
      const nextState = applyViewerToggle(state, field);
      queueMicrotask(() => persistViewerState(nextState));
      return nextState;
    });
  }, [persistViewerState]);

  const handleFitToModel = useCallback(() => {
    pendingFitModeRef.current = 'preserve';
    setFitNonce((nonce) => nonce + 1);
  }, []);

  const handleResetView = useCallback(() => {
    pendingFitModeRef.current = 'default';
    const nextState = normalizeThreeDViewerState(null);
    setViewerState(nextState);
    persistViewerState(nextState);
    setFitNonce((nonce) => nonce + 1);
  }, [persistViewerState]);

  const saveView = useCallback(() => {
    const normalized = persistViewerState(
      { ...viewerState, cameraSaved: true },
      { includeCamera: true },
    );
    setViewerState(normalized);
  }, [persistViewerState, viewerState]);

  const status = useMemo(() => {
    if (!sourceInfo.supported) return `${sourceInfo.format?.toUpperCase() || '3D'} not supported yet`;
    if (sourceInfo.loading) return 'Loading model';
    if (sourceInfo.error) return 'Load failed';
    if (!sourceInfo.sourceUrl) return 'Model file unavailable';
    if (loadError) return 'Load failed';
    return 'Ready';
  }, [loadError, sourceInfo]);

  if (!sourceInfo.supported || (!sourceInfo.sourceUrl && !sourceInfo.loading)) {
    return <ThreeDModelSummary card={card} version={version} compact={compact} />;
  }

  return (
    <div className="h-full w-full min-h-0 flex flex-col bg-preview-bg">
      {showToolbar && (
        <ThreeDToolbar
          viewerState={viewerState}
          status={status}
          compact={compact}
          onToggle={handleToggle}
          onFit={handleFitToModel}
          onReset={handleResetView}
          onSave={saveView}
        />
      )}
      <div ref={viewportRef} className="flex-1 min-h-0 relative">
        {sourceInfo.loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-preview-bg text-secondary serif text-sm">
            Loading model
          </div>
        )}
        {(loadError || sourceInfo.error) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-preview-bg text-center px-4">
            <div>
              <div className="serif text-secondary text-base mb-1">Could not load model</div>
              <div className="sans text-xs text-muted">{loadError || sourceInfo.error}</div>
            </div>
          </div>
        )}
        {sourceInfo.sourceUrl && (
          <ThreeDScene
            sourceUrl={sourceInfo.sourceUrl}
            format={sourceInfo.format}
            viewerState={viewerState}
            viewportSize={viewportSize}
            fitNonce={fitNonce}
            canvasKey={canvasKey}
            pendingFitModeRef={pendingFitModeRef}
            viewerKey={`${card?.id ?? 'card'}:${version?.version ?? 0}`}
            onMetadata={handleMetadata}
            onError={handleError}
            onContextLost={handleContextLost}
            registerCameraSnapshot={(getter) => {
              cameraSnapshotRef.current = getter;
            }}
          />
        )}
      </div>
    </div>
  );
}

export function ThreeDInlineViewer(props) {
  return <ThreeDArtifactViewer {...props} compact showToolbar />;
}

export function ThreeDFullViewer(props) {
  return <ThreeDArtifactViewer {...props} compact={false} showToolbar />;
}

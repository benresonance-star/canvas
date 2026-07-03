import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Grid, OrbitControls } from '@react-three/drei';
import { Box, Grid2X2, LocateFixed, Move3D, RotateCcw, Ruler, Save, SunMedium, Trash2 } from 'lucide-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MOUSE } from 'three';
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
  environmentPresetForLightingMode,
  environmentSettingsForPreset,
  lightingForMode,
  resolveEnvironmentPreset,
} from '../utils/environmentConfig.js';
import {
  applySavedCameraState,
  fitPerspectiveCameraToCurrentView,
  fitPerspectiveCameraToDefaultView,
  syncOrbitControlsAfterCameraFit,
} from '../utils/cameraFit.js';
import { requestActionSync } from '../../../lib/actionSync.js';
import { strings } from '../../../content/strings.js';
import { canRequestFolderLoad } from '../utils/previewFeasibility.js';
import { formatThreeDSize } from '../utils/fileFormat.js';
import { formatMeasurementDistance, MEASUREMENT_UNIT_OPTIONS, normalizeMeasurements, normalizeMeasureUnits } from '../utils/measureSnap.js';
import { extractModelWorldUnits, resolveDisplayMeasureUnits, resolveModelMeasureUnits } from '../utils/detectModelUnits.js';
import { ThreeDMeasurementLayer } from './ThreeDMeasurementLayer.jsx';

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
    metadata: {
      ...(version?.threeD?.metadata ?? {}),
      ...(stats ?? {}),
      measureUnits: version?.threeD?.metadata?.measureUnits
        ?? version?.threeD?.metadata?.units
        ?? undefined,
    },
    viewerState: normalizeThreeDViewerState(
      viewerStateOverride ?? version?.threeD?.viewerState,
    ),
    annotations: version?.threeD?.annotations ?? [],
    measurements: normalizeMeasurements(version?.threeD?.measurements),
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
      environmentPreset: environmentPresetForLightingMode(nextMode),
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
        const modelUnits = extractModelWorldUnits(gltf);
        setObject(loaded);
        onMetadataRef.current?.({
          ...stats,
          modelUnits,
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
  interactive = true,
  snapshotMode = false,
  measureModeActive = false,
  refitOnViewportResize = false,
}) {
  const { camera, gl, invalidate } = useThree();
  const controlsRef = useRef(null);
  const applySavedCamera = !snapshotMode && Boolean(viewerState.cameraSaved);
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
    const controls = controlsRef.current;
    if (!object || !controls || viewportSize.width < 16 || viewportSize.height < 16) return false;

    const canvas = gl.domElement;
    const width = Math.max(1, canvas.clientWidth || viewportSize.width);
    const height = Math.max(1, canvas.clientHeight || viewportSize.height);
    const measuredAspect = width / height;

    if (camera.isPerspectiveCamera) {
      camera.aspect = measuredAspect;
      camera.updateProjectionMatrix();
    }

    const fitOptions = { viewportAspect: measuredAspect };

    if (applySavedCamera) {
      applySavedCameraState(camera, controls, viewerState.camera);
      return true;
    }

    const fitMode = pendingFitModeRef.current;
    const fitted = fitMode === 'preserve'
      ? fitPerspectiveCameraToCurrentView(camera, controls, object, fitOptions)
      : fitPerspectiveCameraToDefaultView(camera, controls, object, fitOptions);

    if (fitted) {
      syncOrbitControlsAfterCameraFit(controls);
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
    viewerState.camera,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    const object = modelObjectRef.current;
    if (!object || viewportSize.width < 16 || viewportSize.height < 16) return undefined;

    const viewportKey = `${viewportSize.width}x${viewportSize.height}`;
    const request = fitRequestRef.current;
    const viewportChanged = refitOnViewportResize
      && viewportKey !== request.viewportKey
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
    const attemptFit = () => {
      if (cancelled) return;
      if (!controlsRef.current) {
        requestAnimationFrame(attemptFit);
        return;
      }
      if (applyCameraFit()) {
        invalidate();
      }
    };
    const frameId = requestAnimationFrame(attemptFit);

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
    refitOnViewportResize,
    viewerState.camera,
    viewportSize.height,
    viewportSize.width,
  ]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={false}
      enableRotate={interactive}
      enableZoom={interactive}
      enablePan={interactive}
      mouseButtons={
        measureModeActive
          ? { LEFT: null, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
          : undefined
      }
    />
  );
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
  interactive = true,
  snapshotMode = false,
  enableMeasurement = false,
  measureModeActive = false,
  measureSnapMode = 'vertex',
  measurements = [],
  measureUnits = 'cm',
  modelMeasureUnits = 'cm',
  cancelDraftNonce = 0,
  onCompleteMeasurement,
  onDraftChange,
  refitOnViewportResize = false,
}) {
  const lighting = lightingForMode(viewerState.lightingMode);
  const environmentSettings = environmentSettingsForPreset(resolveEnvironmentPreset(viewerState));
  const modelObjectRef = useRef(null);
  const [modelRoot, setModelRoot] = useState(null);
  const [modelReadyNonce, setModelReadyNonce] = useState(0);

  const handleObjectReady = useCallback((object) => {
    modelObjectRef.current = object;
    setModelRoot(object ?? null);
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
        frameloop={snapshotMode ? 'demand' : 'always'}
        camera={{
          fov: viewerState.camera.fov ?? 45,
          near: viewerState.camera.near ?? 0.1,
          far: viewerState.camera.far ?? 5000,
        }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        className="bg-preview-bg block w-full h-full"
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
            preset={environmentSettings.preset}
            background={environmentSettings.background}
            environmentIntensity={environmentSettings.environmentIntensity}
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
      {enableMeasurement && modelRoot && (
        <ThreeDMeasurementLayer
          modelRoot={modelRoot}
          measurements={measurements}
          snapMode={measureSnapMode}
          active={measureModeActive}
          units={measureUnits}
          modelUnits={modelMeasureUnits}
          cancelDraftNonce={cancelDraftNonce}
          onCompleteMeasurement={onCompleteMeasurement}
          onDraftChange={onDraftChange}
        />
      )}
      <ViewportCameraBridge
        viewportSize={viewportSize}
        viewerState={viewerState}
        fitNonce={fitNonce}
        modelReadyNonce={modelReadyNonce}
        modelObjectRef={modelObjectRef}
        pendingFitModeRef={pendingFitModeRef}
        viewerKey={viewerKey}
        registerCameraSnapshot={registerCameraSnapshot}
        interactive={interactive}
        snapshotMode={snapshotMode}
        measureModeActive={measureModeActive}
        refitOnViewportResize={refitOnViewportResize}
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
  enableMeasurement = false,
  measureModeActive = false,
  measureSnapMode = 'vertex',
  measureUnits = 'cm',
  onToggleMeasureMode,
  onMeasureSnapModeChange,
  onMeasureUnitsChange,
}) {
  const buttonClass = (active = false) =>
    `inline-flex items-center justify-center rounded border px-2 py-1 transition ${
      active
        ? 'border-accent bg-accent text-on-accent'
        : 'border-border bg-surface text-secondary hover:text-primary hover:bg-surface-muted'
    }`;
  const snapButtonClass = (active = false) =>
    `px-2 py-1 rounded text-[10px] uppercase tracking-wide transition ${
      active
        ? 'bg-accent text-on-accent'
        : 'text-muted hover:text-primary hover:bg-surface-muted'
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
        <button type="button" title={`Lighting: ${viewerState.lightingMode} (${viewerState.environmentPreset})`} className={buttonClass(viewerState.showEnvironment)} onClick={() => onToggle('lightingMode')}>
          <SunMedium size={compact ? 12 : 14} strokeWidth={1.7} />
        </button>
        <button type="button" title="Toggle wireframe" className={buttonClass(viewerState.displayMode === 'wireframe')} onClick={() => onToggle('displayMode')}>
          <Box size={compact ? 12 : 14} strokeWidth={1.7} />
        </button>
        {enableMeasurement && (
          <>
            <button type="button" title="Measure" className={buttonClass(measureModeActive)} onClick={onToggleMeasureMode}>
              <Ruler size={compact ? 12 : 14} strokeWidth={1.7} />
            </button>
            <label className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-secondary">
              <span className="uppercase tracking-wide text-muted">Unit</span>
              <select
                value={measureUnits}
                onChange={(event) => onMeasureUnitsChange?.(event.target.value)}
                className="three-d-measure-unit-select outline-none cursor-pointer"
                aria-label="Measurement unit"
              >
                {MEASUREMENT_UNIT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </label>
            {measureModeActive && (
              <div className="inline-flex items-center rounded border border-border overflow-hidden">
                <button
                  type="button"
                  title="Snap to vertices"
                  className={snapButtonClass(measureSnapMode === 'vertex')}
                  onClick={() => onMeasureSnapModeChange?.('vertex')}
                >
                  Vertex
                </button>
                <button
                  type="button"
                  title="Snap to edges"
                  className={snapButtonClass(measureSnapMode === 'edge')}
                  onClick={() => onMeasureSnapModeChange?.('edge')}
                >
                  Edge
                </button>
              </div>
            )}
          </>
        )}
        {!compact && (
          <button type="button" title="Save view" className={buttonClass()} onClick={onSave}>
            <Save size={14} strokeWidth={1.7} />
          </button>
        )}
      </div>
    </div>
  );
}

function ThreeDMeasurementsPanel({
  measurements,
  units = 'cm',
  modelUnits = 'cm',
  onRemoveMeasurement,
}) {
  if (!measurements.length) return null;

  return (
    <div className="sans absolute bottom-3 left-3 z-20 max-w-sm rounded border border-border bg-surface/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Measurements</div>
      <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
        {measurements.map((measurement, index) => (
          <div key={measurement.id} className="flex items-center justify-between gap-2 text-xs text-secondary">
            <span>
              {index + 1}. {formatMeasurementDistance(measurement.distance, units, modelUnits)}
              <span className="text-muted"> · {measurement.snapMode}</span>
            </span>
            <button
              type="button"
              title="Delete measurement"
              className="inline-flex items-center justify-center rounded border border-border px-1.5 py-0.5 text-muted hover:text-warning hover:border-warning transition"
              onClick={() => onRemoveMeasurement?.(measurement.id)}
            >
              <Trash2 size={12} strokeWidth={1.7} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreeDFolderLoadPanel({
  card,
  version,
  feasibility,
  loading,
  error,
  onLoad,
}) {
  const filename = version?.filename ?? version?.relativePath ?? card?.name ?? '3D model';
  const sizeLabel = formatThreeDSize(version?.size ?? version?.threeD?.sourceFile?.sizeBytes);

  return (
    <div className="h-full w-full min-h-0 flex flex-col items-center justify-center text-center px-6">
      <ThreeDModelSummary
        card={card}
        version={version}
        feasibility={feasibility}
        warnHeavy={feasibility?.warnHeavy}
      />
      <div className="mt-4 flex flex-col items-center gap-2 max-w-sm">
        <div className="sans text-xs text-muted">
          {filename}{sizeLabel ? ` · ${sizeLabel}` : ''}
        </div>
        {error && (
          <div className="sans text-xs text-warning">{error}</div>
        )}
        <button
          type="button"
          className="sans px-4 py-2 rounded border border-accent bg-accent text-on-accent text-sm hover:opacity-90 transition disabled:opacity-50"
          disabled={loading}
          onClick={() => void onLoad()}
        >
          {loading ? strings.threeD.loadingFromFolder : strings.threeD.loadFromFolder}
        </button>
        <div className="sans text-[10px] text-muted leading-relaxed">
          {strings.threeD.loadFromFolderNote}
        </div>
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
  folderLinked = null,
  compact = false,
  showToolbar = true,
  layoutKey = '',
  snapshotMode = false,
  enableMeasurement = false,
}) {
  const linked = folderLinked ?? Boolean(folderHandle);
  const sourceInfo = useThreeDModelSource(version, { folderHandle, folderLinked: linked });
  const [viewerState, setViewerState] = useState(() =>
    snapshotMode
      ? normalizeThreeDViewerState(null)
      : normalizeThreeDViewerState(card?.threeDViewerState ?? version?.threeD?.viewerState),
  );
  const [measurements, setMeasurements] = useState(() =>
    normalizeMeasurements(version?.threeD?.measurements),
  );
  const [measureModeActive, setMeasureModeActive] = useState(false);
  const [measureSnapMode, setMeasureSnapMode] = useState('vertex');
  const [measureDraftActive, setMeasureDraftActive] = useState(false);
  const [cancelDraftNonce, setCancelDraftNonce] = useState(0);
  const [measureUnits, setMeasureUnits] = useState(() =>
    resolveDisplayMeasureUnits(version?.threeD?.metadata, version?.ext),
  );
  const modelMeasureUnits = useMemo(
    () => resolveModelMeasureUnits(version?.threeD?.metadata, sourceInfo.format),
    [sourceInfo.format, version?.threeD?.metadata?.modelUnits],
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
    if (snapshotMode) {
      setViewerState(normalizeThreeDViewerState(null));
      pendingFitModeRef.current = 'default';
      return;
    }
    setViewerState(normalizeThreeDViewerState(card?.threeDViewerState ?? version?.threeD?.viewerState));
    pendingFitModeRef.current = 'default';
  }, [
    card?.id,
    snapshotMode,
    version?.version,
  ]);

  useEffect(() => {
    if (snapshotMode) return;
    setMeasurements(normalizeMeasurements(version?.threeD?.measurements));
    setMeasureUnits(resolveDisplayMeasureUnits(
      version?.threeD?.metadata,
      version?.ext ?? sourceInfo.format,
    ));
  }, [
    snapshotMode,
    sourceInfo.format,
    version?.ext,
    version?.threeD?.measurements,
    version?.threeD?.metadata,
  ]);

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

  const persistMeasurements = useCallback((nextMeasurements) => {
    const normalized = normalizeMeasurements(nextMeasurements);
    setMeasurements(normalized);
    patchVersionThreeD({
      measurements: normalized,
      annotations: version?.threeD?.annotations ?? [],
    });
    scheduleViewerStateSync(projectId ?? card?.projectId ?? null);
  }, [
    card?.projectId,
    patchVersionThreeD,
    projectId,
    scheduleViewerStateSync,
    version?.threeD?.annotations,
  ]);

  const handleCompleteMeasurement = useCallback((record) => {
    persistMeasurements([...measurements, record]);
  }, [measurements, persistMeasurements]);

  const handleRemoveMeasurement = useCallback((measurementId) => {
    persistMeasurements(measurements.filter((entry) => entry.id !== measurementId));
  }, [measurements, persistMeasurements]);

  const handleToggleMeasureMode = useCallback(() => {
    setMeasureModeActive((active) => {
      if (active) {
        setCancelDraftNonce((nonce) => nonce + 1);
        setMeasureDraftActive(false);
      }
      return !active;
    });
  }, []);

  const handleMeasureUnitsChange = useCallback((units) => {
    const normalized = normalizeMeasureUnits(units);
    setMeasureUnits(normalized);
    patchVersionThreeD({
      metadata: {
        ...(version?.threeD?.metadata ?? {}),
        measureUnits: normalized,
      },
      annotations: version?.threeD?.annotations ?? [],
      measurements,
    });
    scheduleViewerStateSync(projectId ?? card?.projectId ?? null);
  }, [
    card?.projectId,
    measurements,
    patchVersionThreeD,
    projectId,
    scheduleViewerStateSync,
    version?.threeD?.annotations,
    version?.threeD?.metadata,
  ]);

  useEffect(() => {
    if (!measureModeActive) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setCancelDraftNonce((nonce) => nonce + 1);
      setMeasureDraftActive(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [measureModeActive]);

  const persistViewerState = useCallback((nextState, { includeCamera = false } = {}) => {
    if (snapshotMode) return normalizeThreeDViewerState(nextState);
    const camera = includeCamera ? cameraSnapshotRef.current?.() : null;
    const normalized = normalizeThreeDViewerState({
      ...nextState,
      ...(camera ? { camera } : {}),
    });
    applyCardUpdate(onUpdateCard, card?.id, { threeDViewerState: normalized });
    patchVersionThreeD({
      viewerState: normalized,
      annotations: version?.threeD?.annotations ?? [],
      measurements,
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
    snapshotMode,
    version?.threeD?.annotations,
    measurements,
  ]);

  const handleMetadata = useCallback((stats) => {
    if (snapshotMode) return;
    patchVersionThreeD(buildThreeDMetadata(
      version,
      sourceInfo,
      stats,
      'ready',
      null,
      viewerStateRef.current,
    ));
  }, [patchVersionThreeD, snapshotMode, sourceInfo, version]);

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
    persistViewerState({ ...nextState, cameraSaved: false });
    setFitNonce((nonce) => nonce + 1);
  }, [persistViewerState]);

  const handleRegisterCameraSnapshot = useCallback((getter) => {
    cameraSnapshotRef.current = getter;
  }, []);

  const saveView = useCallback(() => {
    const normalized = persistViewerState(
      { ...viewerState, cameraSaved: true },
      { includeCamera: true },
    );
    setViewerState(normalized);
  }, [persistViewerState, viewerState]);

  const status = useMemo(() => {
    if (!sourceInfo.supported) return `${sourceInfo.format?.toUpperCase() || '3D'} not supported yet`;
    if (sourceInfo.loading) {
      return sourceInfo.folderLoadRequested
        ? strings.threeD.loadingFromFolder
        : 'Loading model';
    }
    if (sourceInfo.error) return 'Load failed';
    if (!sourceInfo.sourceUrl) {
      switch (sourceInfo.feasibility?.mode) {
        case 'hard_limit':
          return strings.threeD.hardLimit;
        case 'no_folder':
          return strings.threeD.connectFolderHint;
        case 'folder_on_demand':
          return strings.threeD.tooLargeForInline;
        case 'no_source':
          return strings.threeD.noSource;
        default:
          return strings.threeD.noSource;
      }
    }
    if (loadError) return 'Load failed';
    return 'Ready';
  }, [loadError, sourceInfo]);

  const showFolderLoadPanel = !compact
    && canRequestFolderLoad(sourceInfo.feasibility?.mode)
    && !sourceInfo.sourceUrl
    && !sourceInfo.loading;

  if (!sourceInfo.supported) {
    return (
      <ThreeDModelSummary
        card={card}
        version={version}
        compact={compact}
        feasibility={sourceInfo.feasibility}
        warnHeavy={sourceInfo.feasibility?.warnHeavy}
      />
    );
  }

  if (showFolderLoadPanel) {
    return (
      <ThreeDFolderLoadPanel
        card={card}
        version={version}
        feasibility={sourceInfo.feasibility}
        loading={sourceInfo.loading}
        error={sourceInfo.error}
        onLoad={sourceInfo.requestFolderLoad}
      />
    );
  }

  if (!sourceInfo.sourceUrl && !sourceInfo.loading) {
    return (
      <ThreeDModelSummary
        card={card}
        version={version}
        compact={compact}
        feasibility={sourceInfo.feasibility}
        warnHeavy={sourceInfo.feasibility?.warnHeavy}
      />
    );
  }

  return (
    <div className="h-full w-full min-h-0 flex flex-col bg-preview-bg">
      {showToolbar && (
        <ThreeDToolbar
          viewerState={viewerState}
          status={measureModeActive && measureDraftActive ? 'Pick second point (Esc to cancel)' : status}
          compact={compact}
          enableMeasurement={enableMeasurement}
          measureModeActive={measureModeActive}
          measureSnapMode={measureSnapMode}
          onToggle={handleToggle}
          onFit={handleFitToModel}
          onReset={handleResetView}
          onSave={saveView}
          onToggleMeasureMode={handleToggleMeasureMode}
          onMeasureSnapModeChange={setMeasureSnapMode}
          measureUnits={measureUnits}
          onMeasureUnitsChange={handleMeasureUnitsChange}
        />
      )}
      <div ref={viewportRef} className="flex-1 min-h-0 relative">
        {enableMeasurement && measurements.length > 0 && (
          <ThreeDMeasurementsPanel
            measurements={measurements}
            units={measureUnits}
            modelUnits={modelMeasureUnits}
            onRemoveMeasurement={handleRemoveMeasurement}
          />
        )}
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
            viewerKey={`${card?.id ?? 'card'}:${version?.version ?? 0}${snapshotMode ? ':snapshot' : ''}`}
            onMetadata={handleMetadata}
            onError={handleError}
            onContextLost={handleContextLost}
            registerCameraSnapshot={snapshotMode ? undefined : handleRegisterCameraSnapshot}
            interactive={!snapshotMode}
            snapshotMode={snapshotMode}
            refitOnViewportResize={compact}
            enableMeasurement={enableMeasurement}
            measureModeActive={measureModeActive}
            measureSnapMode={measureSnapMode}
            measurements={measurements}
            measureUnits={measureUnits}
            modelMeasureUnits={modelMeasureUnits}
            cancelDraftNonce={cancelDraftNonce}
            onCompleteMeasurement={handleCompleteMeasurement}
            onDraftChange={setMeasureDraftActive}
          />
        )}
      </div>
    </div>
  );
}

export function ThreeDInlineViewer({ showToolbar, snapshotMode = false, ...props }) {
  return (
    <ThreeDArtifactViewer
      {...props}
      compact
      snapshotMode={snapshotMode}
      showToolbar={showToolbar ?? !snapshotMode}
    />
  );
}

export function ThreeDSnapshotViewer(props) {
  return <ThreeDArtifactViewer {...props} compact snapshotMode showToolbar={false} />;
}

export function ThreeDFullViewer(props) {
  return <ThreeDArtifactViewer {...props} compact={false} showToolbar enableMeasurement />;
}

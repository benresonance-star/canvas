import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Axis3D, Box, Camera, Eye, EyeOff, Grid3x3, Layers, LocateFixed, PanelLeft, PanelLeftClose, PanelRight, PanelRightClose, RotateCcw, SunMedium } from 'lucide-react';
import { MOUSE } from 'three';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FragmentsModels, RenderedFaces } from '@thatopen/fragments';
import fragmentsWorkerUrl from '@thatopen/fragments/dist/Worker/worker.mjs?url';
import {
  fitOrthographicCameraToDefaultView,
  fitPerspectiveCameraToDefaultView,
  syncOrbitControlsAfterCameraFit,
} from '../../threeDArtifact/utils/cameraFit.js';
import { MeasurementToolbarControls, MeasurementsListPanel } from '../../threeDArtifact/components/MeasurementUi.jsx';
import { resolveEnvironmentPreset } from '../../threeDArtifact/utils/environmentConfig.js';
import {
  applyHdriEnvironment,
  createBimLegacyLights,
  createDirectLights,
  removeLightGroup,
  setHdriToneMapping,
  setLightGroupVisible,
} from '../../threeDArtifact/utils/hdriEnvironment.js';
import { normalizeMeasurements } from '../../threeDArtifact/utils/measureSnap.js';
import {
  BIM_DEFAULT_FOV,
  createBimCamera,
  resizeBimCamera,
  restoreBimCameraState,
  serializeBimCameraState,
  swapBimCamera,
} from '../bim-core/bimCamera.js';
import { createBimMeasurementController } from '../bim-core/bimMeasurementController.js';
import { createBimMeasurementOverlay } from '../bim-core/bimMeasurementOverlay.js';
import { bimLightingToolbarLabel, cycleBimLightingState } from '../bim-core/bimLighting.js';
import {
  attachWireframeEdges,
  attachWireframeEdgesToScene,
  ensureWireframeEdgesAttached,
  buildWireframeEdgesFromFragmentsModel,
  disposeWireframeEdges,
  renderWireframeOverlay,
  updateWireframeEdgeResolution,
  updateWireframeEdgeVisuals,
} from '../bim-core/bimWireframeOverlay.js';
import {
  applyClayBaseMaterials,
  CLAY_GHOST_MATERIAL,
  CLAY_SELECTED_MATERIAL,
  createClayComposer,
  disposeClayComposer,
  renderClayFrame,
  resolveClayWireframeStyle,
  resizeClayComposer,
  setupClayLighting,
  teardownClayLighting,
  updateClayLightingIntensity,
} from '../bim-core/bimClayRender.js';
import { createPickTimer, isBimPickDebugEnabled, logBimPickMappingFailure } from '../bim-core/bimPickDebug.js';
import {
  chunkLocalIds,
  isFragmentsRaycastHit,
  isPickSuperseded,
  shouldApplySelectionRun,
  shouldSuppressPickFromDrag,
} from '../bim-core/bimPickPipeline.js';
import {
  createFragmentsIdCache,
  isValidFragmentsLocalId,
  populateFragmentsIdCache,
  resolveFragmentsLocalIdsByGlobalIds,
  resolvePickGuidFromHit,
} from '../bim-core/fragmentsSelection.js';
import { BimSelectedElementHud } from './BimSelectedElementHud.jsx';
import {
  WIREFRAME_LINE_WEIGHT_MAX,
  WIREFRAME_LINE_WEIGHT_MIN,
  WIREFRAME_OPACITY_MAX,
  WIREFRAME_OPACITY_MIN,
  CLAY_AO_BIAS_MIN,
  CLAY_AO_BIAS_MAX,
  CLAY_AO_DISTANCE_MIN,
  CLAY_AO_DISTANCE_MAX,
  CLAY_AO_INTENSITY_MIN,
  CLAY_AO_INTENSITY_MAX,
  CLAY_AO_RADIUS_MIN,
  CLAY_AO_RADIUS_MAX,
  CLAY_GLASS_OPACITY_MIN,
  CLAY_GLASS_OPACITY_MAX,
  CLAY_LIGHT_INTENSITY_MIN,
  CLAY_LIGHT_INTENSITY_MAX,
} from '../bim-core/types.js';

function formatClaySliderValue(kind, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  switch (kind) {
    case 'aoIntensity':
      return numeric.toFixed(1);
    case 'aoRadius':
      return numeric.toFixed(2);
    case 'aoBias':
      return numeric >= 0.01 ? numeric.toFixed(2) : numeric.toFixed(5);
    case 'aoDistance':
      return numeric.toFixed(3);
    case 'lightIntensity':
      return numeric.toFixed(2);
    case 'glassOpacity':
      return numeric.toFixed(2);
    default:
      return String(numeric);
  }
}

function claySliderAtLimit(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= min) return 'min';
  if (numeric >= max) return 'max';
  return null;
}

function ClaySliderControl({
  label,
  value,
  min,
  max,
  step,
  title,
  ariaLabel,
  sliderClassName = 'w-16',
  valueClassName = 'min-w-[2.25rem]',
  formatKind,
  onChange,
}) {
  const formatted = formatClaySliderValue(formatKind, value);
  const atLimit = claySliderAtLimit(value, min, max);
  const limitTitle = atLimit === 'max'
    ? `At slider maximum (${formatted}) — range may need extending`
    : atLimit === 'min'
      ? `At slider minimum (${formatted})`
      : `${formatted} (range ${formatClaySliderValue(formatKind, min)}–${formatClaySliderValue(formatKind, max)})`;

  return (
    <label className="inline-flex items-center gap-1 text-[10px] text-secondary" title={title}>
      <span className="text-muted uppercase tracking-wider">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        className={`${sliderClassName} accent-accent`}
        aria-label={ariaLabel}
        aria-valuetext={formatted}
      />
      <span
        className={`${valueClassName} text-right font-mono tabular-nums text-[9px] leading-none ${atLimit ? 'text-accent' : 'text-muted'}`}
        title={limitTitle}
      >
        {formatted}
      </span>
    </label>
  );
}

function syncModelBounds(modelRoot, boundsRef) {
  if (!modelRoot) return;
  modelRoot.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(modelRoot);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  boundsRef.current = {
    radius: Math.max(sphere.radius, 1),
    center: sphere.center.clone(),
  };
}

function getRendererDrawingSize(renderer) {
  if (!renderer) return { width: 1, height: 1 };
  if (typeof renderer.getDrawingBufferSize === 'function') {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    return { width: Math.max(1, size.x), height: Math.max(1, size.y) };
  }
  if (typeof renderer.getSize === 'function') {
    const size = renderer.getSize(new THREE.Vector2());
    return { width: Math.max(1, size.x), height: Math.max(1, size.y) };
  }
  return { width: 1, height: 1 };
}

const SELECTED_MATERIAL = {
  color: new THREE.Color('#f59e0b'),
  renderedFaces: RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
  customId: 'canvas-bim-selected',
};

const GHOST_MATERIAL = {
  color: new THREE.Color('#7a756f'),
  renderedFaces: RenderedFaces.TWO,
  opacity: 0.18,
  transparent: true,
  customId: 'canvas-bim-ghost',
};

const COLOR_BY_PALETTE = [
  '#eab308',
  '#38bdf8',
  '#fb7185',
  '#34d399',
  '#a78bfa',
  '#f97316',
  '#f472b6',
  '#22c55e',
];

function getViewportError(preparedModel) {
  if (!preparedModel) return 'BIM model is not prepared yet.';
  if (preparedModel.metadata?.fragmentsStatus === 'failed') {
    return preparedModel.metadata.fragmentsError || 'Fragments conversion failed.';
  }
  if (preparedModel.metadata?.fragmentsSourceKind && preparedModel.metadata.fragmentsSourceKind !== 'fragments') {
    return 'Prepared model does not contain a renderable Fragments artifact.';
  }
  if (!preparedModel.fragmentsBlob) return 'No Fragments artifact is available for rendering.';
  return null;
}

function isFragmentsModelNotFound(error) {
  return String(error?.message ?? error).includes('Fragments: Model not found');
}

function isStaleFragmentsLifecycleError(error) {
  const message = String(error?.message ?? error);
  return (
    isFragmentsModelNotFound(error)
    || message.includes('Worker was terminated')
    || message.includes('Worker has been terminated')
    || message.includes('Cannot perform Construct on a detached ArrayBuffer')
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function propertyValueForElement(preparedModel, element, colorByProperty) {
  const property = String(colorByProperty ?? '').trim();
  if (!property || property === 'ifcClass' || property === 'class') return element.ifcClass ?? 'Unclassified';
  if (property === 'storey') return element.storeyId ?? 'No storey';
  if (property === 'type' || property === 'typeName') return element.typeName ?? 'No type';
  if (property === 'name') return element.name ?? 'Unnamed';
  const properties = preparedModel?.properties ?? [];
  const match = properties.find((entry) => (
    entry.elementId === element.id
    && (`${entry.psetName}.${entry.propertyName}` === property || entry.propertyName === property)
  ));
  return match?.value ?? `No ${property}`;
}

function materialForColor(color, customId) {
  return {
    color: new THREE.Color(color),
    renderedFaces: RenderedFaces.TWO,
    opacity: 0.92,
    transparent: true,
    customId,
  };
}

export function BimViewport({
  preparedModel,
  selectedElement,
  selectedProperties = [],
  highlightElementIds = [],
  displayMode,
  colorByProperty = null,
  leftPanelOpen = true,
  rightPanelOpen = true,
  initialCamera = null,
  projectionMode = 'perspective',
  onToggleLeftPanel = () => {},
  onToggleRightPanel = () => {},
  onDisplayModeChange,
  onSelectElementByGlobalId = () => {},
  onDeselectElement = () => {},
  onCameraChange = () => {},
  onProjectionModeChange = () => {},
  measurements = [],
  measureUnits = 'm',
  measureSnapMode = 'vertex',
  measureKind = 'segment',
  measurementsVisible = true,
  wireframeMode = false,
  wireframeLineWeight = 2,
  wireframeOpacity = 0.88,
  wireframeColor = '#0f172a',
  renderStyle = 'standard',
  clayAoIntensity = 2,
  clayAoRadius = 2,
  clayAoBias = 0.01,
  clayAoDistance = 0.1,
  clayLightIntensity = 0.55,
  claySurfaceColor = '#f8f8f8',
  clayGlassOpacity = 0.18,
  clayBackgroundColor = '#ffffff',
  showEnvironment = false,
  lightingMode = 'studio',
  environmentPreset = 'studio',
  onMeasurementsChange = () => {},
  onMeasureUnitsChange = () => {},
  onMeasureSnapModeChange = () => {},
  onMeasureKindChange = () => {},
  onMeasurementsVisibleChange = () => {},
  onWireframeModeChange = () => {},
  onWireframeStyleChange = () => {},
  onRenderStyleChange = () => {},
  onClayStyleChange = () => {},
  onLightingChange = () => {},
}) {
  const total = preparedModel?.elements?.length ?? 0;
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const sceneRef = useRef(null);
  const fragmentsRef = useRef(null);
  const modelRef = useRef(null);
  const modelReadyRef = useRef(false);
  const animationRef = useRef(null);
  const localIdsRef = useRef([]);
  const idCacheRef = useRef(createFragmentsIdCache());
  const pickSeqRef = useRef(0);
  const applySelectionSeqRef = useRef(0);
  const onCameraChangeRef = useRef(onCameraChange);
  const onProjectionModeChangeRef = useRef(onProjectionModeChange);
  const projectionModeRef = useRef(projectionMode);
  const initialCameraRef = useRef(initialCamera);
  const pointerDownRef = useRef(null);
  const updateFragmentsRef = useRef(null);
  const measureModeActiveRef = useRef(false);
  const measurementControllerRef = useRef(null);
  const measurementOverlayRef = useRef(null);
  const measurementsRef = useRef(measurements);
  const measureUnitsRef = useRef(measureUnits);
  const measureSnapModeRef = useRef(measureSnapMode);
  const measureKindRef = useRef(measureKind);
  const measurementsVisibleRef = useRef(measurementsVisible);
  const measureVisualStateRef = useRef({
    draftStart: null,
    draftPoints: [],
    previewEnd: null,
    hoverSnap: null,
    snapMode: 'vertex',
    measureKind: 'segment',
  });
  const onMeasurementsChangeRef = useRef(onMeasurementsChange);
  const onMeasureUnitsChangeRef = useRef(onMeasureUnitsChange);
  const onMeasureSnapModeChangeRef = useRef(onMeasureSnapModeChange);
  const onMeasureKindChangeRef = useRef(onMeasureKindChange);
  const showEnvironmentRef = useRef(showEnvironment);
  const lightingModeRef = useRef(lightingMode);
  const environmentPresetRef = useRef(environmentPreset);
  const legacyLightsRef = useRef(null);
  const directLightsRef = useRef(null);
  const disposeEnvironmentRef = useRef(() => {});
  const lightingApplySeqRef = useRef(0);
  const wireframeModeRef = useRef(wireframeMode);
  const wireframeStyleRef = useRef({
    lineWeight: wireframeLineWeight,
    opacity: wireframeOpacity,
    color: wireframeColor,
  });
  const renderStyleRef = useRef(renderStyle);
  const clayStyleRef = useRef({
    aoIntensity: clayAoIntensity,
    aoRadius: clayAoRadius,
    aoBias: clayAoBias,
    aoDistance: clayAoDistance,
    backgroundColor: clayBackgroundColor,
  });
  const clayComposerRef = useRef(null);
  const clayLightingStateRef = useRef(null);
  const wireframeEdgesRef = useRef(null);
  const wireframeBuildSeqRef = useRef(0);
  const wireframeBuildInFlightRef = useRef(false);
  const wireframeRebuildQueuedRef = useRef(false);
  const wireframeRetryAtRef = useRef(0);
  const wireframeOverlaySceneRef = useRef(null);
  const modelBoundsRef = useRef({ radius: 10, center: new THREE.Vector3() });
  const selectedElementRef = useRef(selectedElement);
  const onDeselectElementRef = useRef(onDeselectElement);
  const [loadState, setLoadState] = useState(() => (getViewportError(preparedModel) ? 'error' : 'loading'));
  const [renderError, setRenderError] = useState(() => getViewportError(preparedModel));
  const [pickStatus, setPickStatus] = useState(null);
  const [fovInput, setFovInput] = useState(String(initialCamera?.fov ?? BIM_DEFAULT_FOV));
  const [measureModeActive, setMeasureModeActive] = useState(false);
  const [measureDraftActive, setMeasureDraftActive] = useState(false);
  const [cancelDraftNonce, setCancelDraftNonce] = useState(0);

  useEffect(() => {
    onCameraChangeRef.current = onCameraChange;
  }, [onCameraChange]);

  useEffect(() => {
    onProjectionModeChangeRef.current = onProjectionModeChange;
  }, [onProjectionModeChange]);

  useEffect(() => {
    projectionModeRef.current = projectionMode;
  }, [projectionMode]);

  useEffect(() => {
    initialCameraRef.current = initialCamera;
  }, [initialCamera]);

  useEffect(() => {
    measureModeActiveRef.current = measureModeActive;
  }, [measureModeActive]);

  useEffect(() => {
    measurementsRef.current = measurements;
  }, [measurements]);

  useEffect(() => {
    measureUnitsRef.current = measureUnits;
  }, [measureUnits]);

  useEffect(() => {
    measureSnapModeRef.current = measureSnapMode;
    measurementControllerRef.current?.setSnapMode(measureSnapMode);
  }, [measureSnapMode]);

  useEffect(() => {
    measureKindRef.current = measureKind;
    measurementControllerRef.current?.setMeasureKind(measureKind);
  }, [measureKind]);

  useEffect(() => {
    onMeasurementsChangeRef.current = onMeasurementsChange;
  }, [onMeasurementsChange]);

  useEffect(() => {
    onMeasureUnitsChangeRef.current = onMeasureUnitsChange;
  }, [onMeasureUnitsChange]);

  useEffect(() => {
    onMeasureSnapModeChangeRef.current = onMeasureSnapModeChange;
  }, [onMeasureSnapModeChange]);

  useEffect(() => {
    onMeasureKindChangeRef.current = onMeasureKindChange;
  }, [onMeasureKindChange]);

  useEffect(() => {
    showEnvironmentRef.current = showEnvironment;
  }, [showEnvironment]);

  useEffect(() => {
    lightingModeRef.current = lightingMode;
  }, [lightingMode]);

  useEffect(() => {
    environmentPresetRef.current = environmentPreset;
  }, [environmentPreset]);

  useEffect(() => {
    selectedElementRef.current = selectedElement;
  }, [selectedElement]);

  useEffect(() => {
    onDeselectElementRef.current = onDeselectElement;
  }, [onDeselectElement]);

  useEffect(() => {
    if (!cancelDraftNonce) return;
    measurementControllerRef.current?.cancelDraft();
    setMeasureDraftActive(false);
  }, [cancelDraftNonce]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (measureModeActiveRef.current) {
          setCancelDraftNonce((value) => value + 1);
          return;
        }
        if (selectedElementRef.current) {
          onDeselectElementRef.current();
          setPickStatus(null);
        }
        return;
      }
      if (event.key === 'Enter' && measureKindRef.current === 'polyline') {
        event.preventDefault();
        measurementControllerRef.current?.finishPolyline(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const syncMeasurementOverlay = useCallback(() => {
    const overlay = measurementOverlayRef.current;
    const model = modelRef.current;
    if (!overlay) return;
    const visual = measureVisualStateRef.current;
    overlay.sync({
      measurements: measurementsRef.current,
      draftStart: visual.draftStart,
      draftPoints: visual.draftPoints ?? [],
      previewEnd: visual.previewEnd,
      hoverSnap: visual.hoverSnap,
      snapMode: visual.snapMode ?? measureSnapModeRef.current,
      measureKind: visual.measureKind ?? measureKindRef.current,
      showOnModel: measurementsVisibleRef.current,
      units: measureUnitsRef.current,
      modelUnits: 'm',
      modelRoot: model?.object ?? null,
      active: measureModeActiveRef.current,
    });
  }, []);

  useEffect(() => {
    measurementsVisibleRef.current = measurementsVisible;
    syncMeasurementOverlay();
  }, [measurementsVisible, syncMeasurementOverlay]);

  const emitCameraChange = useCallback(() => {
    const state = serializeBimCameraState(
      cameraRef.current,
      controlsRef.current,
      projectionModeRef.current,
    );
    if (state) onCameraChangeRef.current(state);
  }, []);

  const fitModel = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const model = modelRef.current;
    const renderer = rendererRef.current;
    if (!camera || !controls || !model?.object || !modelReadyRef.current) return;
    const size = renderer?.getSize(new THREE.Vector2());
    const aspect = size?.y ? size.x / size.y : (camera.aspect ?? 1);
    const fitOptions = { margin: 1.35, viewportAspect: aspect };
    if (projectionModeRef.current === 'orthographic') {
      fitOrthographicCameraToDefaultView(camera, controls, model.object, fitOptions);
    } else {
      fitPerspectiveCameraToDefaultView(camera, controls, model.object, fitOptions);
    }
    syncModelBounds(model.object, modelBoundsRef);
    emitCameraChange();
  }, [emitCameraChange]);

  const resetVisibility = useCallback(() => {
    const model = modelRef.current;
    if (!model || !modelReadyRef.current) return;
    void model.resetVisible().then(() => model.resetHighlight()).catch((error) => {
      if (!isStaleFragmentsLifecycleError(error)) {
        setRenderError(error?.message || 'Could not reset BIM visibility.');
      }
    });
  }, []);

  const rebuildWireframeEdges = useCallback(async () => {
    const model = modelRef.current;
    if (!model?.object || !wireframeModeRef.current) {
      disposeWireframeEdges(wireframeEdgesRef.current);
      wireframeEdgesRef.current = null;
      return;
    }
    if (wireframeBuildInFlightRef.current) {
      wireframeRebuildQueuedRef.current = true;
      return;
    }

    const buildSeq = ++wireframeBuildSeqRef.current;
    wireframeBuildInFlightRef.current = true;
    const previousEdges = wireframeEdgesRef.current;
    const { width: resolutionWidth, height: resolutionHeight } = getRendererDrawingSize(rendererRef.current);

    try {
      const localIds = localIdsRef.current.length > 0
        ? localIdsRef.current
        : await model.getLocalIds();
      let edges = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (buildSeq !== wireframeBuildSeqRef.current || !wireframeModeRef.current) return;
        if (attempt > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 150 * attempt));
          await updateFragmentsRef.current?.(true).catch(() => {});
        }
        edges = await buildWireframeEdgesFromFragmentsModel(model, localIds, {
          resolutionWidth,
          resolutionHeight,
          linewidth: wireframeStyleRef.current.lineWeight,
          opacity: wireframeStyleRef.current.opacity,
          color: wireframeStyleRef.current.color,
        });
        if (edges) break;
      }
      if (buildSeq !== wireframeBuildSeqRef.current || !wireframeModeRef.current) {
        disposeWireframeEdges(edges);
        return;
      }
      if (!edges) return;
      const overlayScene = wireframeOverlaySceneRef.current;
      if (overlayScene) {
        attachWireframeEdgesToScene(overlayScene, model.object, edges);
      } else {
        attachWireframeEdges(model.object, edges);
      }
      wireframeEdgesRef.current = edges;
      disposeWireframeEdges(previousEdges);
      syncModelBounds(model.object, modelBoundsRef);
      const bounds = modelBoundsRef.current;
      const camera = cameraRef.current;
      updateWireframeEdgeVisuals(edges, {
        width: resolutionWidth,
        height: resolutionHeight,
        cameraDistance: camera && bounds?.center
          ? camera.position.distanceTo(bounds.center)
          : undefined,
        modelRadius: bounds?.radius,
        lineWeight: wireframeStyleRef.current.lineWeight,
        opacity: wireframeStyleRef.current.opacity,
        color: wireframeStyleRef.current.color,
      });
      void updateFragmentsRef.current?.(true);
    } catch (error) {
      if (buildSeq === wireframeBuildSeqRef.current) {
        console.warn('Could not build BIM wireframe edges.', error);
      }
    } finally {
      if (buildSeq === wireframeBuildSeqRef.current) {
        wireframeBuildInFlightRef.current = false;
        if (wireframeRebuildQueuedRef.current && wireframeModeRef.current) {
          wireframeRebuildQueuedRef.current = false;
          void rebuildWireframeEdges();
        }
      }
    }
  }, []);

  useEffect(() => {
    renderStyleRef.current = renderStyle;
  }, [renderStyle]);

  useEffect(() => {
    clayStyleRef.current = {
      aoIntensity: clayAoIntensity,
      aoRadius: clayAoRadius,
      aoBias: clayAoBias,
      aoDistance: clayAoDistance,
      backgroundColor: clayBackgroundColor,
    };
  }, [clayAoBias, clayAoDistance, clayAoIntensity, clayAoRadius, clayBackgroundColor]);

  useEffect(() => {
    wireframeModeRef.current = wireframeMode;
    if (wireframeMode) {
      wireframeRebuildQueuedRef.current = false;
      void rebuildWireframeEdges();
    } else {
      wireframeRebuildQueuedRef.current = false;
      disposeWireframeEdges(wireframeEdgesRef.current);
      wireframeEdgesRef.current = null;
    }
  }, [wireframeMode, rebuildWireframeEdges]);

  useEffect(() => {
    wireframeStyleRef.current = {
      lineWeight: wireframeLineWeight,
      opacity: wireframeOpacity,
      color: wireframeColor,
    };
    const edges = wireframeEdgesRef.current;
    if (!edges) return;
    const { width, height } = getRendererDrawingSize(rendererRef.current);
    const bounds = modelBoundsRef.current;
    const camera = cameraRef.current;
    updateWireframeEdgeVisuals(edges, {
      width,
      height,
      cameraDistance: camera && bounds?.center
        ? camera.position.distanceTo(bounds.center)
        : undefined,
      modelRadius: bounds?.radius,
      lineWeight: wireframeLineWeight,
      opacity: wireframeOpacity,
      color: wireframeColor,
    });
  }, [wireframeLineWeight, wireframeOpacity, wireframeColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const viewportError = getViewportError(preparedModel);
    setRenderError(viewportError);
    if (!canvas || !container || viewportError) {
      setLoadState(viewportError ? 'error' : 'idle');
      return undefined;
    }

    let disposed = false;
    let updatePending = false;
    modelReadyRef.current = false;
    idCacheRef.current = createFragmentsIdCache();
    setLoadState('loading');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#171412');
    sceneRef.current = scene;
    wireframeOverlaySceneRef.current = new THREE.Scene();

    const savedCamera = initialCameraRef.current;
    const startProjectionMode = projectionModeRef.current;
    let camera = createBimCamera(startProjectionMode, 1, savedCamera);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      canvas,
      logarithmicDepthBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE };
    controlsRef.current = controls;

    const measurementOverlay = createBimMeasurementOverlay({ scene, container });
    measurementOverlayRef.current = measurementOverlay;

    const measurementController = createBimMeasurementController({
      canvas,
      getCamera: () => cameraRef.current,
      getModelRoot: () => modelRef.current?.object ?? null,
      getFragmentsModel: () => modelRef.current ?? null,
      snapMode: measureSnapModeRef.current,
      measureKind: measureKindRef.current,
      onComplete: (record) => {
        const nextMeasurements = normalizeMeasurements([...measurementsRef.current, record]);
        measurementsRef.current = nextMeasurements;
        onMeasurementsChangeRef.current(nextMeasurements);
        syncMeasurementOverlay();
      },
      onDraftChange: (active) => {
        setMeasureDraftActive(active);
      },
      onVisualStateChange: (visual) => {
        measureVisualStateRef.current = visual;
        syncMeasurementOverlay();
      },
    });
    measurementControllerRef.current = measurementController;
    const emitSceneCameraChange = () => {
      const state = serializeBimCameraState(cameraRef.current, controls, projectionModeRef.current);
      if (state) onCameraChangeRef.current(state);
    };
    controls.addEventListener('end', emitSceneCameraChange);

    legacyLightsRef.current = createBimLegacyLights(scene);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      const activeCamera = cameraRef.current;
      if (activeCamera) {
        resizeBimCamera(activeCamera, width, height);
      }
      measurementOverlayRef.current?.resize(width, height);
      updateWireframeEdgeVisuals(wireframeEdgesRef.current, { width, height });
      syncOrbitControlsAfterCameraFit(controls);
    };
    const updateFragments = async (force = false, { retryModelRegistration = false } = {}) => {
      if (disposed || !modelReadyRef.current) return false;
      const previousMaxUpdateRate = fragments.settings.maxUpdateRate;
      try {
        if (force) fragments.settings.maxUpdateRate = 0;
        await fragments.update(force);
        return true;
      } catch (error) {
        if (retryModelRegistration && isFragmentsModelNotFound(error)) {
          for (const waitMs of [16, 50, 100, 200]) {
            await delay(waitMs);
            if (disposed || !modelReadyRef.current) return false;
            try {
              await fragments.update(force);
              return true;
            } catch (retryError) {
              if (!isFragmentsModelNotFound(retryError)) throw retryError;
            }
          }
          return false;
        }
        if (disposed || isStaleFragmentsLifecycleError(error) || isFragmentsModelNotFound(error)) return false;
        throw error;
      } finally {
        fragments.settings.maxUpdateRate = previousMaxUpdateRate;
      }
    };
    updateFragmentsRef.current = updateFragments;
    const resizeAndRefresh = () => {
      resize();
      if (modelReadyRef.current) {
        void updateFragments(true).catch((error) => {
          if (!disposed && !isStaleFragmentsLifecycleError(error)) setRenderError(error?.message || 'Could not update BIM view.');
        });
      }
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    window.addEventListener('resize', resizeAndRefresh);
    resize();

    const fragments = new FragmentsModels(fragmentsWorkerUrl);
    fragments.settings.graphicsQuality = 1;
    fragmentsRef.current = fragments;

    async function loadFragments() {
      try {
        const buffer = await preparedModel.fragmentsBlob.arrayBuffer();
        if (disposed) return;
        const runtimeModelId = preparedModel.metadata?.fragmentsModelId
          ?? preparedModel.metadata?.fingerprint
          ?? `bim-${Date.now()}`;
        const activeCamera = cameraRef.current;
        const model = await fragments.load(buffer, {
          modelId: runtimeModelId,
          camera: activeCamera,
        });
        if (disposed) {
          await model.dispose().catch(() => {});
          return;
        }
        modelRef.current = model;
        model.useCamera(activeCamera);
        scene.add(model.object);
        modelReadyRef.current = true;
        syncModelBounds(model.object, modelBoundsRef);
        if (!disposed) {
          const rect = container.getBoundingClientRect();
          const hasSavedCamera = Boolean(savedCamera);
          resize();
          if (hasSavedCamera) {
            restoreBimCameraState(activeCamera, controls, savedCamera, {
              width: rect.width,
              height: rect.height,
            });
          } else {
            fitModel();
          }
          renderer.render(scene, cameraRef.current);
          emitSceneCameraChange();
          setLoadState('ready');
          if (wireframeModeRef.current) {
            void rebuildWireframeEdges();
          }
          void model.getLocalIds().then(async (ids) => {
            if (!disposed && modelRef.current === model) {
              localIdsRef.current = ids;
              if (wireframeModeRef.current && !wireframeEdgesRef.current) {
                void rebuildWireframeEdges();
              }
              try {
                await populateFragmentsIdCache(model, idCacheRef.current, ids);
              } catch (error) {
                if (!disposed && !isStaleFragmentsLifecycleError(error)) {
                  setRenderError(error?.message || 'Could not build BIM ID cache.');
                }
              }
            }
          }).catch((error) => {
            if (!disposed && !isStaleFragmentsLifecycleError(error)) {
              setRenderError(error?.message || 'Could not read BIM local IDs.');
            }
          });
          [0, 50, 150, 350, 750].forEach((waitMs) => {
            window.setTimeout(() => {
              if (disposed || modelRef.current !== model) return;
              resize();
              if (!hasSavedCamera) fitModel();
              renderer.render(scene, cameraRef.current);
              void updateFragments(true, { retryModelRegistration: true }).catch((error) => {
                if (!disposed && !isStaleFragmentsLifecycleError(error)) setRenderError(error?.message || 'Could not update BIM view.');
              });
            }, waitMs);
          });
          window.requestAnimationFrame(() => {
            if (disposed || modelRef.current !== model) return;
            resize();
            if (!hasSavedCamera) fitModel();
            renderer.render(scene, cameraRef.current);
            void updateFragments(true, { retryModelRegistration: true }).catch((error) => {
              if (!disposed && !isStaleFragmentsLifecycleError(error)) setRenderError(error?.message || 'Could not update BIM view.');
            });
          });
        }
      } catch (error) {
        if (!disposed) {
          setRenderError(error?.message || 'Could not load Fragments model.');
          setLoadState('error');
        }
      }
    }

    const animate = () => {
      if (disposed) return;
      controls.update();
      if (modelReadyRef.current && !updatePending) {
        updatePending = true;
        void updateFragments().finally(() => {
          updatePending = false;
          if (wireframeModeRef.current && wireframeEdgesRef.current) {
            ensureWireframeEdgesAttached(
              wireframeOverlaySceneRef.current,
              modelRef.current?.object ?? null,
              wireframeEdgesRef.current,
            );
          }
        }).catch((error) => {
          if (!disposed && !isStaleFragmentsLifecycleError(error)) setRenderError(error?.message || 'Could not update BIM view.');
        });
      }
      syncMeasurementOverlay();
      const activeCamera = cameraRef.current;
      const wireframeEdges = wireframeEdgesRef.current;
      const overlayScene = wireframeOverlaySceneRef.current;
      const bounds = modelBoundsRef.current;
      const cameraDistance = activeCamera && bounds?.center
        ? activeCamera.position.distanceTo(bounds.center)
        : undefined;

      if (
        wireframeModeRef.current
        && !wireframeEdges
        && !wireframeBuildInFlightRef.current
        && modelReadyRef.current
      ) {
        const now = performance.now();
        if (now - wireframeRetryAtRef.current > 750) {
          wireframeRetryAtRef.current = now;
          void rebuildWireframeEdges();
        }
      }

      if (wireframeModeRef.current && wireframeEdges && overlayScene) {
        ensureWireframeEdgesAttached(overlayScene, modelRef.current?.object ?? null, wireframeEdges);
      }

      if (renderStyleRef.current === 'clay' && clayComposerRef.current) {
        const clayStyle = clayStyleRef.current;
        const wfStyle = wireframeStyleRef.current;
        const wfOpts = resolveClayWireframeStyle({
          lineWeight: wfStyle.lineWeight,
          opacity: wfStyle.opacity,
          color: wfStyle.color,
        });
        renderClayFrame({
          renderer,
          clayComposerState: clayComposerRef.current,
          scene,
          overlayScene,
          camera: activeCamera,
          wireframeEdges,
          wireframeEnabled: wireframeModeRef.current,
          wireframeOptions: {
            ...wfOpts,
            cameraDistance,
            modelRadius: bounds?.radius,
          },
          backgroundColor: clayStyle.backgroundColor,
          aoIntensity: clayStyle.aoIntensity,
          aoRadius: clayStyle.aoRadius,
          aoBias: clayStyle.aoBias,
          aoDistance: clayStyle.aoDistance,
          cameraDistance,
          modelRadius: bounds?.radius,
        });
      } else if (wireframeModeRef.current && wireframeEdges?.parent && overlayScene) {
        const style = wireframeStyleRef.current;
        renderWireframeOverlay(renderer, scene, overlayScene, activeCamera, wireframeEdges, {
          cameraDistance,
          modelRadius: bounds?.radius,
          lineWeight: style.lineWeight,
          opacity: style.opacity,
          color: style.color,
        });
      } else {
        renderer.render(scene, activeCamera);
      }
      measurementOverlayRef.current?.render(scene, activeCamera);
      animationRef.current = window.requestAnimationFrame(animate);
    };

    void loadFragments();
    animate();

    return () => {
      disposed = true;
      modelReadyRef.current = false;
      updateFragmentsRef.current = null;
      lightingApplySeqRef.current += 1;
      disposeEnvironmentRef.current();
      disposeEnvironmentRef.current = () => {};
      const scene = sceneRef.current;
      if (scene) {
        removeLightGroup(scene, directLightsRef.current);
        removeLightGroup(scene, legacyLightsRef.current);
      }
      directLightsRef.current = null;
      legacyLightsRef.current = null;
      wireframeBuildSeqRef.current += 1;
      disposeWireframeEdges(wireframeEdgesRef.current);
      wireframeEdgesRef.current = null;
      disposeClayComposer(clayComposerRef.current);
      clayComposerRef.current = null;
      teardownClayLighting(sceneRef.current, clayLightingStateRef.current);
      clayLightingStateRef.current = null;
      const fragmentsToDispose = fragmentsRef.current;
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeAndRefresh);
      controls.removeEventListener('end', emitSceneCameraChange);
      controls.dispose();
      measurementControllerRef.current?.dispose();
      measurementControllerRef.current = null;
      measurementOverlayRef.current?.dispose();
      measurementOverlayRef.current = null;
      renderer.dispose();
      scene.clear();
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
      wireframeOverlaySceneRef.current = null;
      fragmentsRef.current = null;
      modelRef.current = null;
      localIdsRef.current = [];
      idCacheRef.current = createFragmentsIdCache();
      void Promise.resolve(fragmentsToDispose?.dispose?.()).catch(() => {});
    };
  }, [fitModel, preparedModel, rebuildWireframeEdges, syncMeasurementOverlay]);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer || loadState !== 'ready') return undefined;

    const seq = ++lightingApplySeqRef.current;

    if (renderStyleRef.current === 'clay') return undefined;

    async function applyLighting() {
      disposeEnvironmentRef.current();
      disposeEnvironmentRef.current = () => {};

      if (directLightsRef.current) {
        removeLightGroup(scene, directLightsRef.current);
        directLightsRef.current = null;
      }

      const showEnv = showEnvironmentRef.current;
      if (!showEnv) {
        setLightGroupVisible(legacyLightsRef.current, true);
        scene.environment = null;
        if ('environmentIntensity' in scene) {
          scene.environmentIntensity = 1;
        }
        setHdriToneMapping(renderer, false);
        return;
      }

      setLightGroupVisible(legacyLightsRef.current, false);
      setHdriToneMapping(renderer, true);
      directLightsRef.current = createDirectLights(scene, lightingModeRef.current);

      const preset = resolveEnvironmentPreset({
        showEnvironment: true,
        environmentPreset: environmentPresetRef.current,
        lightingMode: lightingModeRef.current,
      });
      const dispose = await applyHdriEnvironment(scene, renderer, preset);
      if (seq !== lightingApplySeqRef.current) {
        dispose();
        return;
      }
      disposeEnvironmentRef.current = dispose;
    }

    void applyLighting();

    return () => {
      lightingApplySeqRef.current += 1;
    };
  }, [loadState, showEnvironment, lightingMode, environmentPreset, renderStyle]);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!scene || !renderer || !camera || loadState !== 'ready') return undefined;

    if (renderStyle !== 'clay') {
      teardownClayLighting(scene, clayLightingStateRef.current);
      clayLightingStateRef.current = null;
      disposeClayComposer(clayComposerRef.current);
      clayComposerRef.current = null;
      return undefined;
    }

    disposeEnvironmentRef.current();
    disposeEnvironmentRef.current = () => {};
    if (directLightsRef.current) {
      removeLightGroup(scene, directLightsRef.current);
      directLightsRef.current = null;
    }
    setLightGroupVisible(legacyLightsRef.current, false);
    setHdriToneMapping(renderer, false);
    scene.environment = null;

    teardownClayLighting(scene, clayLightingStateRef.current);
    clayLightingStateRef.current = setupClayLighting(scene, {
      backgroundColor: clayBackgroundColor,
      lightIntensity: clayLightIntensity,
    });
    const { width, height } = getRendererDrawingSize(renderer);
    disposeClayComposer(clayComposerRef.current);
    clayComposerRef.current = createClayComposer(renderer, scene, camera, width, height);

    return () => {
      teardownClayLighting(scene, clayLightingStateRef.current);
      clayLightingStateRef.current = null;
      disposeClayComposer(clayComposerRef.current);
      clayComposerRef.current = null;
    };
  }, [clayBackgroundColor, clayLightIntensity, loadState, renderStyle]);

  useEffect(() => {
    if (renderStyle !== 'clay') return;
    updateClayLightingIntensity(clayLightingStateRef.current, clayLightIntensity);
  }, [clayLightIntensity, renderStyle]);

  useEffect(() => {
    const controls = controlsRef.current;
    const controller = measurementControllerRef.current;
    if (!controls) return;
    if (measureModeActive) {
      controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
      controller?.setActive(true);
    } else {
      controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE };
      controller?.setActive(false);
      setMeasureDraftActive(false);
    }
    syncOrbitControlsAfterCameraFit(controls);
  }, [measureModeActive]);

  useEffect(() => {
    syncMeasurementOverlay();
  }, [measurements, measureUnits, measureSnapMode, measureKind, measurementsVisible, syncMeasurementOverlay]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || !modelReadyRef.current || loadState !== 'ready') return;
    const runSeq = ++applySelectionSeqRef.current;
    const timer = createPickTimer('applySelection');
    const cache = idCacheRef.current;

    async function applySelection() {
      const isClay = renderStyle === 'clay';
      const effectiveDisplayMode = isClay && displayMode === 'colorBy' ? 'highlight' : displayMode;
      const ghostMaterial = isClay ? CLAY_GHOST_MATERIAL : GHOST_MATERIAL;
      const selectedMaterial = isClay ? CLAY_SELECTED_MATERIAL : SELECTED_MATERIAL;
      const needsVisibilityReset = effectiveDisplayMode === 'isolate' || effectiveDisplayMode === 'ghostOthers' || effectiveDisplayMode === 'colorBy';
      await model.resetHighlight();
      if (needsVisibilityReset) await model.resetVisible();
      timer.mark('reset');
      if (!shouldApplySelectionRun(runSeq, applySelectionSeqRef.current)) return;

      if (isClay) {
        const allLocalIds = localIdsRef.current.length > 0 ? localIdsRef.current : await model.getLocalIds();
        await applyClayBaseMaterials(model, preparedModel, cache, allLocalIds, {
          surfaceColor: claySurfaceColor,
          glassOpacity: clayGlassOpacity,
        });
        if (!shouldApplySelectionRun(runSeq, applySelectionSeqRef.current)) return;
      }

      const resultElements = (preparedModel?.elements ?? []).filter((element) => highlightElementIds.includes(element.id));
      const selectedOnly = selectedElement ? [selectedElement] : [];
      const targetElements = resultElements.length > 0 ? resultElements : selectedOnly;

      if (targetElements.length === 0) {
        if (effectiveDisplayMode === 'ghostOthers') {
          const allLocalIds = localIdsRef.current.length > 0 ? localIdsRef.current : await model.getLocalIds();
          for (const chunk of chunkLocalIds(allLocalIds)) {
            if (!shouldApplySelectionRun(runSeq, applySelectionSeqRef.current)) return;
            await model.highlight(chunk, ghostMaterial);
          }
        }
        timer.finish({ displayMode, targetCount: 0, localIdCount: 0 });
        return;
      }

      const idMap = await resolveFragmentsLocalIdsByGlobalIds(
        model,
        targetElements.map((element) => element.ifcGlobalId),
        cache,
      );
      if (!shouldApplySelectionRun(runSeq, applySelectionSeqRef.current)) return;

      const localIds = targetElements
        .map((element) => idMap.get(element.ifcGlobalId))
        .filter(isValidFragmentsLocalId);
      if (localIds.length === 0) return;

      const primaryLocalId = selectedElement
        ? idMap.get(selectedElement.ifcGlobalId)
        : localIds[0];

      if (effectiveDisplayMode === 'colorBy') {
        const groups = new Map();
        targetElements.forEach((element) => {
          const value = String(propertyValueForElement(preparedModel, element, colorByProperty));
          if (!groups.has(value)) groups.set(value, []);
          groups.get(value).push(element);
        });
        let groupIndex = 0;
        for (const [value, elements] of groups) {
          if (!shouldApplySelectionRun(runSeq, applySelectionSeqRef.current)) return;
          const groupLocalIds = elements
            .map((element) => idMap.get(element.ifcGlobalId))
            .filter(isValidFragmentsLocalId);
          if (groupLocalIds.length > 0) {
            await model.highlight(
              groupLocalIds,
              materialForColor(COLOR_BY_PALETTE[groupIndex % COLOR_BY_PALETTE.length], `canvas-bim-color-${groupIndex}-${value}`),
            );
          }
          groupIndex += 1;
        }
      } else if (effectiveDisplayMode === 'isolate') {
        await model.setVisible(undefined, false);
        await model.setVisible(localIds, true);
      } else if (effectiveDisplayMode === 'ghostOthers') {
        const allLocalIds = localIdsRef.current.length > 0 ? localIdsRef.current : await model.getLocalIds();
        const selectedSet = new Set(localIds);
        const otherLocalIds = allLocalIds.filter((candidate) => !selectedSet.has(candidate));
        for (const chunk of chunkLocalIds(otherLocalIds)) {
          if (!shouldApplySelectionRun(runSeq, applySelectionSeqRef.current)) return;
          await model.highlight(chunk, ghostMaterial);
        }
      }

      if (!shouldApplySelectionRun(runSeq, applySelectionSeqRef.current)) return;
      if (effectiveDisplayMode !== 'colorBy') await model.highlight(localIds, selectedMaterial);
      if (selectedElement && isValidFragmentsLocalId(primaryLocalId)) {
        await model.highlight([primaryLocalId], selectedMaterial);
      }

      timer.mark('highlight');
      timer.finish({ displayMode, targetCount: targetElements.length, localIdCount: localIds.length });
    }

    void applySelection().catch((error) => {
      if (shouldApplySelectionRun(runSeq, applySelectionSeqRef.current) && !isStaleFragmentsLifecycleError(error)) {
        setRenderError(error?.message || 'Could not apply BIM selection.');
      }
    });
  }, [
    clayGlassOpacity,
    claySurfaceColor,
    colorByProperty,
    displayMode,
    highlightElementIds,
    loadState,
    preparedModel,
    renderStyle,
    selectedElement,
  ]);

  const handleCanvasPointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const pickFromPointerEvent = useCallback((event) => {
    if (measureModeActiveRef.current) return;
    if (event.button !== 0) return;
    const pointerDown = pointerDownRef.current;
    pointerDownRef.current = null;
    if (shouldSuppressPickFromDrag(pointerDown, { x: event.clientX, y: event.clientY })) {
      return;
    }
    const model = modelRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!model || !camera || !renderer || !modelReadyRef.current) {
      if (!modelReadyRef.current) {
        setPickStatus('Model is still loading — try again in a moment.');
      }
      return;
    }
    const pickSeq = ++pickSeqRef.current;
    const timer = createPickTimer('pick');
    setPickStatus(null);
    const mouse = new THREE.Vector2(event.clientX, event.clientY);
    const fragments = fragmentsRef.current;
    const cache = idCacheRef.current;
    const elements = preparedModel?.elements ?? [];
    const raycast = async () => {
      if (!modelReadyRef.current || modelRef.current !== model) return null;
      return model.raycast({ camera, mouse, dom: renderer.domElement });
    };

    void (async () => {
      try {
        let hit = await raycast();
        timer.mark('raycast-immediate');

        if (!isFragmentsRaycastHit(hit) && selectedElementRef.current) {
          onDeselectElementRef.current();
          setPickStatus(null);
          timer.finish({ outcome: 'miss-deselect' });
          return;
        }

        if (isBimPickDebugEnabled()) {
          const abTimer = createPickTimer('pick-ab');
          const forcedUpdateStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
          await Promise.resolve(fragments?.update?.(true)).catch((error) => {
            if (!isStaleFragmentsLifecycleError(error)) throw error;
            return null;
          });
          const forcedUpdateMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - forcedUpdateStart);
          const forcedHit = await raycast();
          abTimer.finish({
            immediateHit: Boolean(hit),
            forcedHit: Boolean(forcedHit),
            forcedUpdateMs,
            displayMode,
          });
          if (!hit) hit = forcedHit;
        } else if (!hit) {
          await Promise.resolve(fragments?.update?.(true)).catch((error) => {
            if (!isStaleFragmentsLifecycleError(error)) throw error;
            return null;
          });
          hit = await raycast();
          timer.mark('raycast-after-forced-update');
        }

        if (!hit && modelReadyRef.current && modelRef.current === model) {
          hit = await raycast();
          timer.mark('raycast-retry');
        }

        if (isPickSuperseded(pickSeq, pickSeqRef.current)) {
          timer.finish({ cancelled: true });
          return;
        }

        if (!isFragmentsRaycastHit(hit)) {
          setPickStatus(null);
          timer.finish({ outcome: 'miss' });
          return;
        }

        const { guid, mappingFailure, usedExpressIdFallback } = await resolvePickGuidFromHit(model, hit, elements, cache);
        timer.mark('guid-resolve');

        if (isPickSuperseded(pickSeq, pickSeqRef.current)) {
          timer.finish({ cancelled: true });
          return;
        }

        if (guid) {
          const selected = onSelectElementByGlobalId(guid);
          if (selected === false) {
            logBimPickMappingFailure('guid-not-in-prepared-index', { guid, hit });
            setPickStatus('Picked geometry is not in the prepared element index.');
          } else {
            setPickStatus(null);
          }
          timer.finish({ outcome: 'select', guid, displayMode, usedExpressIdFallback: Boolean(usedExpressIdFallback) });
          return;
        }

        logBimPickMappingFailure(mappingFailure ?? 'unknown', { hit });
        setPickStatus('Could not map picked geometry to an IFC element.');
        onDeselectElement();
        timer.finish({ outcome: 'mapping-failure', mappingFailure });
      } catch (error) {
        if (isPickSuperseded(pickSeq, pickSeqRef.current)) return;
        if (!isStaleFragmentsLifecycleError(error)) {
          setPickStatus(error?.message || 'Could not pick BIM geometry.');
        }
      }
    })();
  }, [displayMode, onSelectElementByGlobalId, preparedModel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    canvas.addEventListener('pointerdown', handleCanvasPointerDown);
    canvas.addEventListener('pointerup', pickFromPointerEvent, true);
    return () => {
      canvas.removeEventListener('pointerdown', handleCanvasPointerDown);
      canvas.removeEventListener('pointerup', pickFromPointerEvent, true);
    };
  }, [handleCanvasPointerDown, pickFromPointerEvent]);

  const handleToggleProjection = useCallback(() => {
    if (loadState !== 'ready') return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const model = modelRef.current;
    const container = containerRef.current;
    if (!camera || !controls || !container) return;
    const nextMode = projectionMode === 'perspective' ? 'orthographic' : 'perspective';
    const rect = container.getBoundingClientRect();
    const newCamera = swapBimCamera(camera, controls, model, nextMode, {
      width: rect.width,
      height: rect.height,
    });
    cameraRef.current = newCamera;
    projectionModeRef.current = nextMode;
    onProjectionModeChangeRef.current(nextMode);
    emitCameraChange();
    void updateFragmentsRef.current?.(true);
  }, [emitCameraChange, loadState, projectionMode]);

  const applyFovToCamera = useCallback((rawValue) => {
    const camera = cameraRef.current;
    if (!camera?.isPerspectiveCamera) return null;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return null;
    const clamped = Math.min(120, Math.max(10, parsed));
    if (camera.fov !== clamped) {
      camera.fov = clamped;
      camera.updateProjectionMatrix();
      void updateFragmentsRef.current?.(true);
    }
    return clamped;
  }, []);

  const handleFovInputChange = useCallback((event) => {
    const { value } = event.target;
    setFovInput(value);
    applyFovToCamera(value);
  }, [applyFovToCamera]);

  const handleFovInputBlur = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera?.isPerspectiveCamera) return;
    const clamped = applyFovToCamera(fovInput) ?? camera.fov;
    setFovInput(String(clamped));
    emitCameraChange();
  }, [applyFovToCamera, emitCameraChange, fovInput]);

  const handleToggleMeasureMode = useCallback(() => {
    setMeasureModeActive((active) => !active);
  }, []);

  const handleToggleLighting = useCallback(() => {
    onLightingChange(cycleBimLightingState({
      showEnvironment,
      environmentPreset,
      lightingMode,
    }));
  }, [environmentPreset, lightingMode, onLightingChange, showEnvironment]);

  const handleToggleWireframe = useCallback(() => {
    onWireframeModeChange(!wireframeMode);
  }, [onWireframeModeChange, wireframeMode]);

  const handleToggleClay = useCallback(() => {
    onRenderStyleChange(renderStyle === 'clay' ? 'standard' : 'clay');
  }, [onRenderStyleChange, renderStyle]);

  const handleRemoveMeasurement = useCallback((measurementId) => {
    onMeasurementsChangeRef.current(
      measurementsRef.current.filter((entry) => entry.id !== measurementId),
    );
  }, []);

  const measureStatus = measureModeActive && measureSnapMode === 'edge'
    ? 'Click edge to measure'
    : measureModeActive && measureKind === 'polyline' && measureDraftActive
      ? 'Add points · Enter to finish · click first point for perimeter + area · Esc to cancel'
      : measureModeActive && measureKind === 'polyline'
        ? 'Click first polyline point (Esc to cancel)'
        : measureModeActive && measureDraftActive
          ? 'Pick second point (Esc to cancel)'
          : measureModeActive && measureSnapMode === 'vertex'
            ? 'Click first point (Esc to cancel)'
            : null;

  return (
    <div className="h-full min-h-0 flex flex-col bg-preview-bg">
      <div className="shrink-0 flex items-center justify-between border-b border-border bg-surface px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted truncate">
          {measureStatus ?? (selectedElement
            ? 'Left-click empty space or Esc to deselect · Right-drag orbit · Middle-drag pan'
            : `IFC Fragments View - ${total} elements · Left-click select · Right-drag orbit · Middle-drag pan`)}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={leftPanelOpen ? 'Collapse element list' : 'Expand element list'}
            onClick={onToggleLeftPanel}
            className="rounded border border-border p-1 text-secondary hover:bg-surface-muted"
          >
            {leftPanelOpen ? <PanelLeftClose size={14} strokeWidth={1.7} /> : <PanelLeft size={14} strokeWidth={1.7} />}
          </button>
          <button
            type="button"
            title={rightPanelOpen ? 'Collapse inspector' : 'Expand inspector'}
            onClick={onToggleRightPanel}
            className="rounded border border-border p-1 text-secondary hover:bg-surface-muted"
          >
            {rightPanelOpen ? <PanelRightClose size={14} strokeWidth={1.7} /> : <PanelRight size={14} strokeWidth={1.7} />}
          </button>
          <button type="button" title="Reset visibility" onClick={resetVisibility} className="rounded border border-border p-1 text-secondary hover:bg-surface-muted">
            <RotateCcw size={14} strokeWidth={1.7} />
          </button>
          <button type="button" title="Fit to model" onClick={fitModel} className="rounded border border-border p-1 text-secondary hover:bg-surface-muted">
            <LocateFixed size={14} strokeWidth={1.7} />
          </button>
          {projectionMode === 'perspective' && (
            <input
              type="number"
              min={10}
              max={120}
              step={1}
              value={fovInput}
              title="Field of view (degrees)"
              aria-label="Field of view (degrees)"
              onChange={handleFovInputChange}
              onBlur={handleFovInputBlur}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              className="w-12 rounded border border-border bg-surface px-1 py-1 text-[10px] text-secondary"
            />
          )}
          <button
            type="button"
            title={projectionMode === 'perspective' ? 'Switch to isometric (orthographic)' : 'Switch to perspective'}
            onClick={handleToggleProjection}
            className={`rounded border border-border p-1 ${projectionMode === 'orthographic' ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
          >
            {projectionMode === 'perspective'
              ? <Axis3D size={14} strokeWidth={1.7} />
              : <Camera size={14} strokeWidth={1.7} />}
          </button>
          <button
            type="button"
            title={renderStyle === 'clay' ? 'Lighting disabled in clay mode' : bimLightingToolbarLabel({ showEnvironment, environmentPreset })}
            onClick={handleToggleLighting}
            disabled={renderStyle === 'clay'}
            className={`rounded border border-border p-1 ${showEnvironment && renderStyle !== 'clay' ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'} ${renderStyle === 'clay' ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <SunMedium size={14} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            title="Clay render (Arctic)"
            onClick={handleToggleClay}
            className={`rounded border border-border p-1 ${renderStyle === 'clay' ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
          >
            <Layers size={14} strokeWidth={1.7} />
          </button>
          {renderStyle === 'clay' ? (
            <div className="flex max-w-[42rem] flex-wrap items-center gap-x-1.5 gap-y-1 border-l border-border pl-1.5 ml-0.5" aria-label="Clay style controls">
              <ClaySliderControl
                label="AO"
                value={clayAoIntensity}
                min={CLAY_AO_INTENSITY_MIN}
                max={CLAY_AO_INTENSITY_MAX}
                step={0.5}
                formatKind="aoIntensity"
                sliderClassName="w-20"
                title="AO strength — darker crevice shading"
                ariaLabel="Clay AO intensity"
                onChange={(event) => onClayStyleChange({ clayAoIntensity: Number(event.target.value) })}
              />
              <ClaySliderControl
                label="R"
                value={clayAoRadius}
                min={CLAY_AO_RADIUS_MIN}
                max={CLAY_AO_RADIUS_MAX}
                step={0.05}
                formatKind="aoRadius"
                sliderClassName="w-20"
                title="AO sample radius — wider soft shadows"
                ariaLabel="Clay AO radius"
                onChange={(event) => onClayStyleChange({ clayAoRadius: Number(event.target.value) })}
              />
              <ClaySliderControl
                label="B"
                value={clayAoBias}
                min={CLAY_AO_BIAS_MIN}
                max={CLAY_AO_BIAS_MAX}
                step={0.01}
                formatKind="aoBias"
                valueClassName="min-w-[2.5rem]"
                title="AO bias — tighter crevice detection"
                ariaLabel="Clay AO bias"
                onChange={(event) => onClayStyleChange({ clayAoBias: Number(event.target.value) })}
              />
              <ClaySliderControl
                label="D"
                value={clayAoDistance}
                min={CLAY_AO_DISTANCE_MIN}
                max={CLAY_AO_DISTANCE_MAX}
                step={0.005}
                formatKind="aoDistance"
                title="AO distance — depth span of contact shadows"
                ariaLabel="Clay AO distance"
                onChange={(event) => onClayStyleChange({ clayAoDistance: Number(event.target.value) })}
              />
              <ClaySliderControl
                label="Lit"
                value={clayLightIntensity}
                min={CLAY_LIGHT_INTENSITY_MIN}
                max={CLAY_LIGHT_INTENSITY_MAX}
                step={0.1}
                formatKind="lightIntensity"
                title="Skylight fill — lower lets AO read stronger"
                ariaLabel="Clay light intensity"
                onChange={(event) => onClayStyleChange({ clayLightIntensity: Number(event.target.value) })}
              />
              <ClaySliderControl
                label="Gls"
                value={clayGlassOpacity}
                min={CLAY_GLASS_OPACITY_MIN}
                max={CLAY_GLASS_OPACITY_MAX}
                step={0.01}
                formatKind="glassOpacity"
                sliderClassName="w-14"
                title="Glazing opacity"
                ariaLabel="Clay glass opacity"
                onChange={(event) => onClayStyleChange({ clayGlassOpacity: Number(event.target.value) })}
              />
              <input type="color" value={claySurfaceColor} onChange={(event) => onClayStyleChange({ claySurfaceColor: event.target.value })} title="Clay surface colour" aria-label="Clay surface colour" className="h-6 w-6 cursor-pointer rounded border border-border bg-surface p-0.5" />
              <input type="color" value={clayBackgroundColor} onChange={(event) => onClayStyleChange({ clayBackgroundColor: event.target.value })} title="Clay background colour" aria-label="Clay background colour" className="h-6 w-6 cursor-pointer rounded border border-border bg-surface p-0.5" />
            </div>
          ) : null}
          <button
            type="button"
            title="Wireframe overlay (visible edges)"
            onClick={handleToggleWireframe}
            className={`rounded border border-border p-1 ${wireframeMode ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
          >
            <Grid3x3 size={14} strokeWidth={1.7} />
          </button>
          {wireframeMode ? (
            <div
              className="flex items-center gap-1.5 border-l border-border pl-1.5 ml-0.5"
              aria-label="Wireframe style controls"
            >
              <label
                className="inline-flex items-center gap-1 text-[10px] text-secondary"
                title="Wireframe line weight"
              >
                <span className="text-muted uppercase tracking-wider">Wt</span>
                <input
                  type="range"
                  min={WIREFRAME_LINE_WEIGHT_MIN}
                  max={WIREFRAME_LINE_WEIGHT_MAX}
                  step={0.25}
                  value={wireframeLineWeight}
                  onChange={(event) => onWireframeStyleChange({
                    wireframeLineWeight: Number(event.target.value),
                  })}
                  className="w-14 accent-accent"
                  aria-label="Wireframe line weight"
                />
              </label>
              <label
                className="inline-flex items-center gap-1 text-[10px] text-secondary"
                title="Wireframe transparency"
              >
                <span className="text-muted uppercase tracking-wider">α</span>
                <input
                  type="range"
                  min={Math.round(WIREFRAME_OPACITY_MIN * 100)}
                  max={Math.round(WIREFRAME_OPACITY_MAX * 100)}
                  step={5}
                  value={Math.round(wireframeOpacity * 100)}
                  onChange={(event) => onWireframeStyleChange({
                    wireframeOpacity: Number(event.target.value) / 100,
                  })}
                  className="w-14 accent-accent"
                  aria-label="Wireframe transparency"
                />
              </label>
              <input
                type="color"
                value={wireframeColor}
                onChange={(event) => onWireframeStyleChange({ wireframeColor: event.target.value })}
                title="Wireframe colour"
                aria-label="Wireframe colour"
                className="h-6 w-6 cursor-pointer rounded border border-border bg-surface p-0.5"
              />
            </div>
          ) : null}
          <MeasurementToolbarControls
            measureModeActive={measureModeActive}
            measureSnapMode={measureSnapMode}
            measureKind={measureKind}
            measureUnits={measureUnits}
            onToggleMeasureMode={handleToggleMeasureMode}
            onMeasureSnapModeChange={onMeasureSnapModeChange}
            onMeasureKindChange={onMeasureKindChange}
            onMeasureUnitsChange={onMeasureUnitsChange}
            compact
            buttonClassName={(active) => `rounded border border-border p-1 ${
              active ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'
            }`}
            activeButtonClassName="rounded border border-border p-1 bg-accent text-on-accent"
          />
          <button
            type="button"
            title="Highlight"
            onClick={() => onDisplayModeChange('highlight')}
            className={`rounded border border-border p-1 ${displayMode === 'highlight' ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
          >
            <Box size={14} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            title="Ghost others"
            onClick={() => onDisplayModeChange('ghostOthers')}
            className={`rounded border border-border p-1 ${displayMode === 'ghostOthers' ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
          >
            <Eye size={14} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            title="Isolate"
            onClick={() => onDisplayModeChange('isolate')}
            className={`rounded border border-border p-1 ${displayMode === 'isolate' ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
          >
            <EyeOff size={14} strokeWidth={1.7} />
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />
        {loadState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-preview-bg/80 text-xs text-muted">
            Loading Fragments model
          </div>
        )}
        {loadState === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-preview-bg px-8 text-center">
            <div>
              <div className="serif text-lg text-primary mb-2">Fragments viewport unavailable</div>
              <div className="sans text-xs text-warning">{renderError}</div>
            </div>
          </div>
        )}
        {loadState === 'ready' && measurements.length > 0 && (
          <MeasurementsListPanel
            measurements={measurements}
            units={measureUnits}
            modelUnits="m"
            measurementsVisible={measurementsVisible}
            onMeasurementsVisibleChange={onMeasurementsVisibleChange}
            onRemoveMeasurement={handleRemoveMeasurement}
            className="sans absolute right-3 bottom-3 z-20 max-w-sm rounded border border-border bg-surface/95 px-3 py-2 shadow-lg backdrop-blur-sm"
          />
        )}
        {loadState === 'ready' && selectedElement && (
          <BimSelectedElementHud
            element={selectedElement}
            properties={selectedProperties}
            inspectorOpen={rightPanelOpen}
          />
        )}
        {loadState === 'ready' && pickStatus && (
          <div className="pointer-events-none absolute right-3 bottom-3 max-w-sm rounded border border-warning/40 bg-surface/95 px-3 py-2 text-xs text-warning shadow-sm">
            {pickStatus}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Axis3D, Box, Bot, Braces, Camera, Circle, EyeOff, Ghost, Grid3x3, Layers, LocateFixed, PanelLeft, PanelLeftClose, PanelRight, PanelRightClose, RotateCcw, Slice, SlidersHorizontal } from 'lucide-react';
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
import { createBimCameraKeyboardNav } from '../bim-core/bimCameraKeyboardNav.js';
import { createBimMeasurementController } from '../bim-core/bimMeasurementController.js';
import { createBimMeasurementOverlay } from '../bim-core/bimMeasurementOverlay.js';
import { cycleBimLightingState } from '../bim-core/bimLighting.js';
import { BimStyleSettingsHud } from './BimStyleSettingsHud.jsx';
import { BimAgentHud } from './BimAgentHud.jsx';
import { BimBqlHud } from './BimBqlHud.jsx';
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
  applyClayViewportMaterials,
  applyViewportBackground,
  canReuseClayBlendFastPath,
  clearClayMaterialGroupCache,
  invalidateClayMaterialSnapshot,
  scheduleClayMaterialGroupsPrefetch,
  CLAY_GHOST_MATERIAL,
  CLAY_SELECTED_MATERIAL,
  createClayComposer,
  disposeClayComposer,
  renderClayFrame,
  resolveClayViewDistance,
  resolveClayWireframeStyle,
  resolveClayMaterialApplyParams,
  resizeClayComposer,
  setupClayLighting,
  teardownClayLighting,
  updateClayLightingIntensity,
  updateClaySsaoQuality,
} from '../bim-core/bimClayRender.js';
import { createPickTimer, isBimPickDebugEnabled, logBimPickMappingFailure } from '../bim-core/bimPickDebug.js';
import { createClayApplyTimer, publishClayDebugMarker, publishClayFrameDebugSnapshot, getClayEffectDebugMarker } from '../bim-core/bimClayDebug.js';
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
import { applyBimLayerStoreyVisibility, buildBimLayerCatalog } from '../bim-core/bimLayerVisibility.js';
import {
  applyRendererClippingPlanes,
  buildSectionGeometriesFromModelSection,
  buildViewportBoundsFromBox3,
  createSectionOverlayGroup,
  disposeSectionOverlay,
  fetchModelSection,
  flipPrimaryPlaneNormal,
  normalizeBimSectionState,
  patchPrimaryPlaneHeight,
  renderSectionOverlayPass,
  resolveSectionLocalIds,
  resolveVisibleLocalIds,
  sectionHeightRangeFromBounds,
  sectionPlanesToThreePlanes,
  updateSectionOverlayStyle,
} from '../bim-core/bimSectioning.js';
import { BimLayersHud } from './BimLayersHud.jsx';
import { BimSectionHud } from './BimSectionHud.jsx';
import { BimSelectedElementHud } from './BimSelectedElementHud.jsx';
import {
  CLAY_AO_BIAS_DEFAULT,
  CLAY_AO_DISTANCE_DEFAULT,
  CLAY_AO_INTENSITY_DEFAULT,
  CLAY_AO_RADIUS_DEFAULT,
  CLAY_AO_RESOLUTION_DEFAULT,
  CLAY_AO_SAMPLES_DEFAULT,
  CLAY_GLASS_OPACITY_DEFAULT,
  CLAY_ORIGINAL_COLOR_BLEND_DEFAULT,
  CLAY_LIGHT_INTENSITY_DEFAULT,
  CLAY_SURFACE_COLOR_DEFAULT,
  VIEWPORT_BACKGROUND_DEFAULT,
} from '../bim-core/types.js';

function syncModelBounds(modelRoot, boundsRef, onBoundsChange) {
  if (!modelRoot) return;
  modelRoot.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(modelRoot);
  const next = buildViewportBoundsFromBox3(box);
  boundsRef.current = {
    radius: next.radius,
    center: new THREE.Vector3(next.center.x, next.center.y, next.center.z),
    min: next.min,
    max: next.max,
  };
  onBoundsChange?.(next);
}

function resolveBimViewDistance(camera, controls, bounds) {
  return resolveClayViewDistance(camera, controls?.target, bounds?.center);
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

function getRendererLogicalSize(renderer) {
  if (!renderer?.getSize) return { width: 1, height: 1 };
  const size = renderer.getSize(new THREE.Vector2());
  return { width: Math.max(1, size.x), height: Math.max(1, size.y) };
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
  return isFragmentsModelNotFoundError(error);
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

import {
  BIM_VIEWPORT_LOAD_PHASES,
  FRAGMENTS_BOOT_IDLE_TIMEOUT_MS,
  FRAGMENTS_MODEL_REGISTRATION_RETRY_DELAYS_MS,
  configureFragmentsManagerForBimViewport,
  hasViewportLayoutSize,
  isFragmentsModelNotFoundError,
  isFragmentsModelRegistered,
  loadFragmentsModelWithRetries,
  resolveBimViewportRuntimeModelId,
  syncFragmentsForViewportBoot,
  waitForAnimationFrame,
  waitForFragmentsModelIdle,
  waitForFragmentsModelRegistered,
  waitForViewportLayout,
} from '../bim-core/bimViewportBoot.js';

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

function BimViewportToolbarSeparator() {
  return (
    <div
      className="mx-3 h-5 w-px shrink-0 bg-border"
      role="separator"
      aria-orientation="vertical"
    />
  );
}

export function BimViewport({
  preparedModel,
  selectedElement,
  selectedProperties = [],
  highlightElementIds = [],
  queryViewerMode = null,
  displayMode,
  isolateOnSelect = false,
  hiddenStoreys = [],
  hiddenLayers = [],
  section = null,
  colorByProperty = null,
  leftPanelOpen = true,
  rightPanelOpen = true,
  initialCamera = null,
  projectionMode = 'perspective',
  onToggleLeftPanel = () => {},
  onToggleRightPanel = () => {},
  onDisplayModeChange,
  onIsolateOnSelectChange = () => {},
  onHiddenStoreysChange = () => {},
  onHiddenLayersChange = () => {},
  onSectionChange = () => {},
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
  wireframeHiddenLines = true,
  renderStyle = 'standard',
  clayAoIntensity = CLAY_AO_INTENSITY_DEFAULT,
  clayAoRadius = CLAY_AO_RADIUS_DEFAULT,
  clayAoBias = CLAY_AO_BIAS_DEFAULT,
  clayAoDistance = CLAY_AO_DISTANCE_DEFAULT,
  clayAoSamples = CLAY_AO_SAMPLES_DEFAULT,
  clayAoResolution = CLAY_AO_RESOLUTION_DEFAULT,
  clayLightIntensity = CLAY_LIGHT_INTENSITY_DEFAULT,
  claySurfaceColor = CLAY_SURFACE_COLOR_DEFAULT,
  clayGlassOpacity = CLAY_GLASS_OPACITY_DEFAULT,
  clayOriginalColorBlend = CLAY_ORIGINAL_COLOR_BLEND_DEFAULT,
  viewportBackgroundColor = VIEWPORT_BACKGROUND_DEFAULT,
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
  onViewportBackgroundChange = () => {},
  onLightingChange = () => {},
  projectId = null,
  cardId = null,
  artifactId = null,
  styleSettings = null,
  onApplyStyleSettings = () => {},
  fitToModelOnLoad = true,
  agentText = '',
  onAgentTextChange = () => {},
  agentResponderId = 'local-bim-rules',
  onAgentResponderIdChange = () => {},
  agentSelectedResponderLabel = '',
  agentResponderLabel = '',
  agentProviderStatus = { status: 'ready', label: 'ready', message: '' },
  agentRunState = { status: 'idle', message: null },
  agentResponse = null,
  agentStatusLine = null,
  onAskSelectedAgent = () => {},
  onRefreshAgentProviderState = () => {},
  selectedAgentConnector = null,
  bqlQueryText = '',
  onBqlQueryTextChange = () => {},
  bqlSelectedSavedQueryId = '',
  bqlSavedQueries = [],
  bqlRebuildDisabled = false,
  bqlStatusLine = null,
  bqlStatusIsError = false,
  onBqlRunQuery = () => {},
  onBqlSaveQuery = () => {},
  onBqlClearQuery = () => {},
  onBqlDeleteSelectedQuery = () => {},
  onBqlRebuildCache = () => {},
  onBqlApplyPreset = () => {},
  onBqlLoadSavedQuery = () => {},
}) {
  const total = preparedModel?.elements?.length ?? 0;
  const loadDetail = total > 0 ? `${total.toLocaleString()} elements` : null;
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const keyboardNavRef = useRef(null);
  const pointerWalkTargetRef = useRef(null);
  const pointerWalkRaycastSeqRef = useRef(0);
  const sceneRef = useRef(null);
  const fragmentsRef = useRef(null);
  const modelRef = useRef(null);
  const modelReadyRef = useRef(false);
  const animationRef = useRef(null);
  const localIdsRef = useRef([]);
  const idCacheRef = useRef(createFragmentsIdCache());
  const pickSeqRef = useRef(0);
  const applySelectionSeqRef = useRef(0);
  const clayApplySeqRef = useRef(0);
  const clayApplyInFlightRef = useRef(false);
  const clayReapplyInFlightRef = useRef(false);
  const clayMaterialParamsRef = useRef({
    claySurfaceColor,
    clayGlassOpacity,
    clayOriginalColorBlend,
  });
  const hiddenStoreysRef = useRef(hiddenStoreys);
  const hiddenLayersRef = useRef(hiddenLayers);
  const sectionStateRef = useRef(normalizeBimSectionState(section ?? {}));
  const activeClippingPlanesRef = useRef([]);
  const sectionOverlaySceneRef = useRef(null);
  const sectionOverlayGroupRef = useRef(null);
  const sectionRebuildSeqRef = useRef(0);
  const sectionRebuildInFlightRef = useRef(false);
  const sectionRebuildQueuedRef = useRef(false);
  const onCameraChangeRef = useRef(onCameraChange);
  const onProjectionModeChangeRef = useRef(onProjectionModeChange);
  const projectionModeRef = useRef(projectionMode);
  const initialCameraRef = useRef(initialCamera);
  const pointerDownRef = useRef(null);
  const updateFragmentsRef = useRef(null);
  const resizeAndRefreshRef = useRef(null);
  const viewportSizedRef = useRef(false);
  const viewportEffectSeqRef = useRef(0);
  const loadedFragmentsModelIdRef = useRef(null);
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
    hiddenLines: wireframeHiddenLines,
  });
  const renderStyleRef = useRef(renderStyle);
  const viewportBackgroundRef = useRef(viewportBackgroundColor);
  const clayStyleRef = useRef({
    aoIntensity: clayAoIntensity,
    aoRadius: clayAoRadius,
    aoBias: clayAoBias,
    aoDistance: clayAoDistance,
    aoSamples: clayAoSamples,
    aoResolution: clayAoResolution,
    backgroundColor: viewportBackgroundColor,
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
  const [loadPhase, setLoadPhase] = useState(BIM_VIEWPORT_LOAD_PHASES.preparing);
  const [renderError, setRenderError] = useState(() => getViewportError(preparedModel));
  const [pickStatus, setPickStatus] = useState(null);
  const [fovInput, setFovInput] = useState(String(initialCamera?.fov ?? BIM_DEFAULT_FOV));
  const [measureModeActive, setMeasureModeActive] = useState(false);
  const [measureDraftActive, setMeasureDraftActive] = useState(false);
  const [cancelDraftNonce, setCancelDraftNonce] = useState(0);
  const [styleHudOpen, setStyleHudOpen] = useState(false);
  const [agentHudOpen, setAgentHudOpen] = useState(false);
  const [bqlHudOpen, setBqlHudOpen] = useState(false);
  const [layersHudOpen, setLayersHudOpen] = useState(false);
  const [sectionHudOpen, setSectionHudOpen] = useState(false);
  const [selectionRefreshNonce, setSelectionRefreshNonce] = useState(0);
  const [clayLocalIdsReadyNonce, setClayLocalIdsReadyNonce] = useState(0);
  const [viewportBounds, setViewportBounds] = useState(() => ({
    radius: modelBoundsRef.current.radius,
    center: {
      x: modelBoundsRef.current.center.x,
      y: modelBoundsRef.current.center.y,
      z: modelBoundsRef.current.center.z,
    },
    min: { x: -1, y: -1, z: -1 },
    max: { x: 1, y: 1, z: 1 },
  }));
  const normalizedSection = useMemo(
    () => normalizeBimSectionState(section ?? {}, {
      defaultPlaneY: sectionHeightRangeFromBounds(viewportBounds).defaultY,
    }),
    [section, viewportBounds],
  );
  const sectionClipKey = useMemo(() => JSON.stringify({
    enabled: normalizedSection.enabled,
    planes: normalizedSection.planes,
  }), [normalizedSection.enabled, normalizedSection.planes]);
  const sectionOverlayDebounceRef = useRef(null);
  const preparedModelRef = useRef(preparedModel);
  preparedModelRef.current = preparedModel;
  const syncViewportBounds = useCallback((bounds) => {
    if (bounds) setViewportBounds(bounds);
  }, []);
  const preparedModelKey = preparedModel?.metadata?.fingerprint
    ?? preparedModel?.metadata?.fragmentsModelId
    ?? null;
  const layerCatalog = useMemo(
    () => buildBimLayerCatalog(preparedModel),
    [preparedModelKey],
  );

  const fitToModelOnLoadRef = useRef(fitToModelOnLoad);
  useEffect(() => {
    fitToModelOnLoadRef.current = fitToModelOnLoad;
  }, [fitToModelOnLoad]);

  clayMaterialParamsRef.current = {
    claySurfaceColor,
    clayGlassOpacity,
    clayOriginalColorBlend,
  };

  useEffect(() => {
    hiddenStoreysRef.current = hiddenStoreys;
  }, [hiddenStoreys]);

  useEffect(() => {
    hiddenLayersRef.current = hiddenLayers;
  }, [hiddenLayers]);

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
    if (!camera || !controls || !model?.object) return;
    const size = renderer?.getSize(new THREE.Vector2());
    const aspect = size?.y ? size.x / size.y : (camera.aspect ?? 1);
    const fitOptions = { margin: 1.35, viewportAspect: aspect };
    if (projectionModeRef.current === 'orthographic') {
      fitOrthographicCameraToDefaultView(camera, controls, model.object, fitOptions);
    } else {
      fitPerspectiveCameraToDefaultView(camera, controls, model.object, fitOptions);
    }
    syncModelBounds(model.object, modelBoundsRef, syncViewportBounds);
    emitCameraChange();
  }, [emitCameraChange, syncViewportBounds]);

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
          await updateFragmentsRef.current?.(true, { retryModelRegistration: true }).catch(() => {});
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
      syncModelBounds(model.object, modelBoundsRef, syncViewportBounds);
      const bounds = modelBoundsRef.current;
      const camera = cameraRef.current;
      updateWireframeEdgeVisuals(edges, {
        width: resolutionWidth,
        height: resolutionHeight,
        cameraDistance: resolveBimViewDistance(camera, controlsRef.current, bounds),
        modelRadius: bounds?.radius,
        lineWeight: wireframeStyleRef.current.lineWeight,
        opacity: wireframeStyleRef.current.opacity,
        color: wireframeStyleRef.current.color,
      });
      void updateFragmentsRef.current?.(true, { retryModelRegistration: true });
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

  const syncSectionClipping = useCallback(() => {
    const bounds = modelBoundsRef.current;
    const normalized = normalizeBimSectionState(sectionStateRef.current, {
      defaultPlaneY: bounds?.center?.y ?? 0,
    });
    activeClippingPlanesRef.current = sectionPlanesToThreePlanes(normalized);
    applyRendererClippingPlanes(rendererRef.current, activeClippingPlanesRef.current);
  }, []);

  const rebuildSectionOverlay = useCallback(async () => {
    syncSectionClipping();
    const bounds = modelBoundsRef.current;
    const normalized = normalizeBimSectionState(sectionStateRef.current, {
      defaultPlaneY: sectionHeightRangeFromBounds({
        min: bounds.min,
        max: bounds.max,
        center: bounds.center,
        radius: bounds.radius,
      }).defaultY,
    });
    const overlayScene = sectionOverlaySceneRef.current;

    if (!normalized.enabled) {
      disposeSectionOverlay(sectionOverlayGroupRef.current);
      sectionOverlayGroupRef.current = null;
      overlayScene?.clear?.();
      return;
    }

    const model = modelRef.current;
    if (!model || !modelReadyRef.current) return;

    if (sectionRebuildInFlightRef.current) {
      sectionRebuildQueuedRef.current = true;
      return;
    }

    const buildSeq = ++sectionRebuildSeqRef.current;
    sectionRebuildInFlightRef.current = true;
    try {
      const planes = sectionPlanesToThreePlanes(normalized);
      if (planes.length === 0) {
        disposeSectionOverlay(sectionOverlayGroupRef.current);
        sectionOverlayGroupRef.current = null;
        overlayScene?.clear?.();
        return;
      }

      const localIds = await resolveSectionLocalIds(
        model,
        preparedModelRef.current,
        idCacheRef.current,
        hiddenStoreysRef.current,
        hiddenLayersRef.current,
      );
      if (buildSeq !== sectionRebuildSeqRef.current) return;

      let modelSection = await fetchModelSection(model, planes[0], localIds);
      if ((!modelSection?.index || modelSection.index <= 0) && localIds?.length) {
        modelSection = await fetchModelSection(model, planes[0], undefined);
      }
      if (buildSeq !== sectionRebuildSeqRef.current) return;

      disposeSectionOverlay(sectionOverlayGroupRef.current);
      sectionOverlayGroupRef.current = null;
      overlayScene?.clear?.();

      if (!modelSection) return;

      const geometries = buildSectionGeometriesFromModelSection(modelSection);
      const { width, height } = getRendererDrawingSize(rendererRef.current);
      const group = createSectionOverlayGroup(geometries, normalized, {
        width,
        height,
        planeNormal: planes[0]?.normal,
        modelRadius: bounds?.radius,
      });
      sectionOverlayGroupRef.current = group;
      overlayScene?.add(group);
    } catch (error) {
      if (buildSeq === sectionRebuildSeqRef.current) {
        console.warn('Could not rebuild BIM section overlay.', error);
      }
    } finally {
      if (buildSeq === sectionRebuildSeqRef.current) {
        sectionRebuildInFlightRef.current = false;
        if (sectionRebuildQueuedRef.current && sectionStateRef.current?.enabled) {
          sectionRebuildQueuedRef.current = false;
          void rebuildSectionOverlay();
        }
      }
    }
  }, [syncSectionClipping]);

  const refreshSectionCut = useCallback(async ({ updateFragments = true } = {}) => {
    syncSectionClipping();
    if (!modelReadyRef.current) return;
    try {
      if (updateFragments) {
        await updateFragmentsRef.current?.(true, { retryModelRegistration: true });
      }
      await rebuildSectionOverlay();
    } catch (error) {
      if (!isStaleFragmentsLifecycleError(error)) {
        setRenderError(error?.message || 'Could not update BIM section cut.');
      }
    }
  }, [rebuildSectionOverlay, syncSectionClipping]);

  const scheduleSectionOverlayRebuild = useCallback((delayMs = 32) => {
    if (sectionOverlayDebounceRef.current) {
      window.clearTimeout(sectionOverlayDebounceRef.current);
    }
    sectionOverlayDebounceRef.current = window.setTimeout(() => {
      sectionOverlayDebounceRef.current = null;
      void rebuildSectionOverlay();
    }, delayMs);
  }, [rebuildSectionOverlay]);

  const applyLiveSectionState = useCallback((nextSection, { rebuildOverlay = true, delayMs = 32 } = {}) => {
    const normalized = normalizeBimSectionState(nextSection, {
      defaultPlaneY: sectionHeightRangeFromBounds(viewportBounds).defaultY,
    });
    sectionStateRef.current = normalized;
    syncSectionClipping();
    onSectionChange(normalized);
    if (rebuildOverlay && normalized.enabled && modelReadyRef.current) {
      scheduleSectionOverlayRebuild(delayMs);
    }
  }, [onSectionChange, scheduleSectionOverlayRebuild, syncSectionClipping, viewportBounds]);

  const prevSectionEnabledRef = useRef(normalizedSection.enabled);

  useEffect(() => {
    sectionStateRef.current = normalizeBimSectionState(section ?? {}, {
      defaultPlaneY: sectionHeightRangeFromBounds(viewportBounds).defaultY,
    });
  }, [section, viewportBounds]);

  useEffect(() => {
    syncSectionClipping();
  }, [section, syncSectionClipping]);

  useEffect(() => {
    if (!modelReadyRef.current) return undefined;
    const wasEnabled = prevSectionEnabledRef.current;
    const isEnabled = normalizedSection.enabled;
    prevSectionEnabledRef.current = isEnabled;

    if (!isEnabled) {
      if (wasEnabled) {
        void refreshSectionCut({ updateFragments: true });
      }
      return undefined;
    }

    if (!wasEnabled) {
      void refreshSectionCut({ updateFragments: true });
      return undefined;
    }

    scheduleSectionOverlayRebuild(32);
    return () => {
      if (sectionOverlayDebounceRef.current) {
        window.clearTimeout(sectionOverlayDebounceRef.current);
        sectionOverlayDebounceRef.current = null;
      }
    };
  }, [sectionClipKey, normalizedSection.enabled, refreshSectionCut, scheduleSectionOverlayRebuild]);

  useEffect(() => {
    if (!modelReadyRef.current || !sectionStateRef.current?.enabled) return undefined;
    scheduleSectionOverlayRebuild(0);
    return undefined;
  }, [
    normalizedSection.showFills,
    normalizedSection.showEdges,
    scheduleSectionOverlayRebuild,
  ]);

  useEffect(() => {
    if (!sectionStateRef.current?.enabled || !modelReadyRef.current) return undefined;
    scheduleSectionOverlayRebuild(64);
    return undefined;
  }, [hiddenStoreys, hiddenLayers, scheduleSectionOverlayRebuild]);

  const refreshSectionCutRef = useRef(() => {});
  refreshSectionCutRef.current = refreshSectionCut;
  const syncSectionClippingRef = useRef(syncSectionClipping);
  syncSectionClippingRef.current = syncSectionClipping;

  useEffect(() => {
    renderStyleRef.current = renderStyle;
  }, [renderStyle]);

  useEffect(() => {
    viewportBackgroundRef.current = viewportBackgroundColor;
  }, [viewportBackgroundColor]);

  useEffect(() => {
    clayStyleRef.current = {
      aoIntensity: clayAoIntensity,
      aoRadius: clayAoRadius,
      aoBias: clayAoBias,
      aoDistance: clayAoDistance,
      aoSamples: clayAoSamples,
      aoResolution: clayAoResolution,
      backgroundColor: viewportBackgroundColor,
    };
  }, [clayAoBias, clayAoDistance, clayAoIntensity, clayAoRadius, clayAoSamples, clayAoResolution, viewportBackgroundColor]);

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
      hiddenLines: wireframeHiddenLines,
    };
    const edges = wireframeEdgesRef.current;
    if (!edges) return;
    const { width, height } = getRendererDrawingSize(rendererRef.current);
    const bounds = modelBoundsRef.current;
    const camera = cameraRef.current;
    updateWireframeEdgeVisuals(edges, {
      width,
      height,
      cameraDistance: resolveBimViewDistance(camera, controlsRef.current, bounds),
      modelRadius: bounds?.radius,
      lineWeight: wireframeLineWeight,
      opacity: wireframeOpacity,
      color: wireframeColor,
    });
  }, [wireframeLineWeight, wireframeOpacity, wireframeColor, wireframeHiddenLines]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const activePreparedModel = preparedModelRef.current;
    const viewportError = getViewportError(activePreparedModel);
    setRenderError(viewportError);
    if (!canvas || !container || viewportError) {
      setLoadState(viewportError ? 'error' : 'idle');
      return undefined;
    }

    let disposed = false;
    const effectSeq = ++viewportEffectSeqRef.current;
    const isEffectActive = () => !disposed && effectSeq === viewportEffectSeqRef.current;
    let updatePending = false;
    let updatePendingStartedAt = 0;
    const FRAGMENTS_UPDATE_FRAME_TIMEOUT_MS = 12000;
    modelReadyRef.current = false;
    viewportSizedRef.current = false;
    loadedFragmentsModelIdRef.current = null;
    idCacheRef.current = createFragmentsIdCache();
    setLoadState('loading');
    setLoadPhase(BIM_VIEWPORT_LOAD_PHASES.preparing);

    let fragments = null;
    const createFragmentsManager = () => {
      const nextFragments = new FragmentsModels(fragmentsWorkerUrl);
      configureFragmentsManagerForBimViewport(nextFragments);
      fragments = nextFragments;
      fragmentsRef.current = nextFragments;
      return nextFragments;
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(viewportBackgroundRef.current);
    sceneRef.current = scene;
    wireframeOverlaySceneRef.current = new THREE.Scene();
    sectionOverlaySceneRef.current = new THREE.Scene();

    const savedCamera = fitToModelOnLoadRef.current ? null : initialCameraRef.current;
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
    renderer.setClearColor(viewportBackgroundRef.current, 1);
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

    const schedulePointerWalkTargetRaycast = (clientX, clientY) => {
      const seq = ++pointerWalkRaycastSeqRef.current;
      void (async () => {
        const model = modelRef.current;
        const activeCamera = cameraRef.current;
        const activeRenderer = rendererRef.current;
        if (!model || !activeCamera || !activeRenderer || !modelReadyRef.current) return;
        try {
          const hit = await model.raycast({
            camera: activeCamera,
            mouse: new THREE.Vector2(clientX, clientY),
            dom: activeRenderer.domElement,
          });
          if (seq !== pointerWalkRaycastSeqRef.current) return;
          if (hit?.point) {
            pointerWalkTargetRef.current = hit.point.isVector3
              ? hit.point.clone()
              : new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
            return;
          }
          pointerWalkTargetRef.current = null;
        } catch {
          if (seq === pointerWalkRaycastSeqRef.current) pointerWalkTargetRef.current = null;
        }
      })();
    };

    const keyboardNav = createBimCameraKeyboardNav({
      domElement: container,
      getCamera: () => cameraRef.current,
      getControls: () => controlsRef.current,
      getEnabled: () => modelReadyRef.current && !measureModeActiveRef.current,
      getPointerWalkTarget: () => pointerWalkTargetRef.current,
      onPointerMove: schedulePointerWalkTargetRaycast,
      onCameraMoved: emitSceneCameraChange,
    });
    keyboardNavRef.current = keyboardNav;

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
      if (renderStyleRef.current === 'clay' && clayComposerRef.current) {
        const style = clayStyleRef.current;
        resizeClayComposer(clayComposerRef.current, width, height, {
          aoSamples: style.aoSamples,
          aoResolution: style.aoResolution,
        });
      }
      syncOrbitControlsAfterCameraFit(controls);
    };
    const updateFragments = async (
      force = false,
      { retryModelRegistration = false, requireModelReady = true } = {},
    ) => {
      if (!isEffectActive() || (requireModelReady && !modelReadyRef.current)) return false;
      if (!fragments) return false;
      const modelId = loadedFragmentsModelIdRef.current ?? modelRef.current?.modelId;
      if (!modelId || !isFragmentsModelRegistered(fragments, modelId)) {
        return false;
      }
      if (modelRef.current && cameraRef.current) {
        modelRef.current.useCamera(cameraRef.current);
      }
      const previousMaxUpdateRate = fragments.settings.maxUpdateRate;
      try {
        if (force) fragments.settings.maxUpdateRate = 0;
        await fragments.update(force);
        return true;
      } catch (error) {
        if (retryModelRegistration && isFragmentsModelNotFound(error)) {
          for (const waitMs of FRAGMENTS_MODEL_REGISTRATION_RETRY_DELAYS_MS) {
            await delay(waitMs);
            if (!isEffectActive() || (requireModelReady && !modelReadyRef.current)) return false;
            if (!isFragmentsModelRegistered(fragments, modelId)) continue;
            try {
              await fragments.update(force);
              return true;
            } catch (retryError) {
              if (!isFragmentsModelNotFound(retryError)) throw retryError;
            }
          }
          return false;
        }
        if (!isEffectActive() || isStaleFragmentsLifecycleError(error) || isFragmentsModelNotFound(error)) return false;
        throw error;
      } finally {
        fragments.settings.maxUpdateRate = previousMaxUpdateRate;
      }
    };
    const reapplyLayerStoreyVisibilityAfterUpdate = async () => {
      const storeys = hiddenStoreysRef.current;
      const layers = hiddenLayersRef.current;
      if (storeys.length === 0 && layers.length === 0) return;
      const model = modelRef.current;
      if (!model || !modelReadyRef.current) return;
      await applyBimLayerStoreyVisibility(model, preparedModelRef.current, idCacheRef.current, {
        hiddenStoreys: storeys,
        hiddenLayers: layers,
      });
    };
    const shouldSkipClayFragmentFrameLoop = () => {
      if (renderStyleRef.current !== 'clay') return false;
      const orig = Number(clayMaterialParamsRef.current?.clayOriginalColorBlend) || 0;
      if (orig < 1) return false;
      const hasLayerFilter = hiddenStoreysRef.current.length > 0 || hiddenLayersRef.current.length > 0;
      const hasSectionClip = sectionStateRef.current?.enabled === true;
      return !hasLayerFilter && !hasSectionClip;
    };
    const reapplyClayMaterialsAfterUpdate = async () => {
      if (renderStyleRef.current !== 'clay') return;
      if (clayReapplyInFlightRef.current) return;
      const model = modelRef.current;
      if (!model || !modelReadyRef.current) return;
      const allLocalIds = localIdsRef.current;
      if (!allLocalIds?.length) return;

      clayReapplyInFlightRef.current = true;
      try {
        const baseResult = await applyClayBaseMaterials(
          model,
          preparedModelRef.current,
          idCacheRef.current,
          allLocalIds,
          clayMaterialParamsRef.current,
          {
            reapplyOnly: true,
            debugSource: 'reapply',
            quietDebug: true,
          },
        );
        const updateOk = await updateFragments(true, { retryModelRegistration: true });
        applyViewportBackground(sceneRef.current, rendererRef.current, viewportBackgroundRef.current);
        if (baseResult.ok && updateOk === false) {
          const timer = createClayApplyTimer('reapplyClayMaterialsAfterUpdate');
          timer.finish({
            source: 'reapply',
            ok: false,
            reason: 'update-fragments-failed',
            stats: baseResult.stats,
            updateBeforeOk: null,
            updateAfterOk: updateOk,
            localIdsCount: allLocalIds.length,
          });
        } else if (baseResult.ok) {
          publishClayFrameDebugSnapshot(baseResult.stats, { localIdsCount: allLocalIds.length });
        }
      } finally {
        clayReapplyInFlightRef.current = false;
      }
    };
    updateFragmentsRef.current = updateFragments;
    const resizeAndRefresh = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const hasValidSize = hasViewportLayoutSize(width, height);
      const firstValidSize = hasValidSize && !viewportSizedRef.current;
      if (hasValidSize) viewportSizedRef.current = true;

      resize();

      if (!modelReadyRef.current) return;

      if (firstValidSize && fitToModelOnLoadRef.current) {
        fitModel();
      }

      void updateFragments(true, { retryModelRegistration: true })
        .then(async () => {
          await reapplyClayMaterialsAfterUpdate();
          await reapplyLayerStoreyVisibilityAfterUpdate();
        })
        .catch((error) => {
        if (!disposed && !isStaleFragmentsLifecycleError(error)) {
          setRenderError(error?.message || 'Could not update BIM view.');
        }
      });
    };
    resizeAndRefreshRef.current = resizeAndRefresh;
    const resizeObserver = new ResizeObserver(resizeAndRefresh);
    resizeObserver.observe(container);
    window.addEventListener('resize', resizeAndRefresh);
    resizeAndRefresh();

    async function loadFragments() {
      try {
        setLoadPhase(BIM_VIEWPORT_LOAD_PHASES.reading);
        const buffer = await preparedModelRef.current.fragmentsBlob.arrayBuffer();
        if (!isEffectActive()) return;
        setLoadPhase(BIM_VIEWPORT_LOAD_PHASES.loadingGeometry);
        const runtimeModelId = resolveBimViewportRuntimeModelId(preparedModelRef.current);
        loadedFragmentsModelIdRef.current = runtimeModelId;
        const activeCamera = cameraRef.current;
        const loadResult = await loadFragmentsModelWithRetries(createFragmentsManager, (activeFragments) => (
          activeFragments.load(buffer.slice(0), {
            modelId: runtimeModelId,
            camera: activeCamera,
          })
        ), {
          disposed: () => !isEffectActive(),
        });
        if (!isEffectActive() || loadResult.status === 'disposed') return;
        if (loadResult.status !== 'loaded' || !loadResult.model || !loadResult.fragments) {
          setRenderError('Fragments geometry load stalled. Reload the model.');
          setLoadState('error');
          return;
        }
        fragments = loadResult.fragments;
        fragmentsRef.current = fragments;
        const model = loadResult.model;
        if (!isEffectActive()) {
          await model.dispose().catch(() => {});
          return;
        }
        await waitForAnimationFrame();
        if (!isEffectActive()) {
          await model.dispose().catch(() => {});
          return;
        }
        modelRef.current = model;
        clearClayMaterialGroupCache(model);
        model.useCamera(activeCamera);
        model.getClippingPlanesEvent = () => activeClippingPlanesRef.current;
        scene.add(model.object);
        syncModelBounds(model.object, modelBoundsRef, syncViewportBounds);

        setLoadPhase(BIM_VIEWPORT_LOAD_PHASES.registering);
        const registered = await waitForFragmentsModelRegistered(fragments, runtimeModelId, {
          disposed: () => !isEffectActive(),
        });
        if (!isEffectActive()) return;
        if (!registered) {
          setRenderError('Fragments model did not register in the worker. Reload the model.');
          setLoadState('error');
          return;
        }

        await waitForFragmentsModelIdle(model, {
          disposed: () => !isEffectActive(),
          timeoutMs: FRAGMENTS_BOOT_IDLE_TIMEOUT_MS,
        });
        if (!isEffectActive()) return;

        if (!disposed) {
          setLoadPhase(BIM_VIEWPORT_LOAD_PHASES.buildingView);
          const layoutReady = await waitForViewportLayout(container, {
            disposed: () => !isEffectActive(),
          });
          if (!isEffectActive()) return;
          if (layoutReady) viewportSizedRef.current = true;

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

          setLoadPhase(BIM_VIEWPORT_LOAD_PHASES.syncing);
          const synced = await syncFragmentsForViewportBoot(updateFragments, {
            disposed: () => !isEffectActive(),
          });
          if (!isEffectActive()) return;
          if (!synced) {
            setRenderError('Fragments view did not finish loading. Resize the panel or reload the model.');
            setLoadState('error');
            return;
          }

          setLoadPhase(BIM_VIEWPORT_LOAD_PHASES.finishing);
          localIdsRef.current = [];

          await waitForAnimationFrame();
          await waitForAnimationFrame();
          if (!isEffectActive()) return;
          modelReadyRef.current = true;
          syncSectionClippingRef.current();
          renderer.render(scene, cameraRef.current);
          emitSceneCameraChange();
          setLoadState('ready');
          startAnimateLoop();
          if (sectionStateRef.current?.enabled) {
            void refreshSectionCutRef.current?.();
          }
          if (wireframeModeRef.current) {
            void rebuildWireframeEdges();
          }
          void model.getLocalIds().then(async (ids) => {
            if (disposed || modelRef.current !== model) return;
            localIdsRef.current = ids;
            if (wireframeModeRef.current && !wireframeEdgesRef.current) {
              void rebuildWireframeEdges();
            }
            try {
              scheduleClayMaterialGroupsPrefetch(model, ids, () => {
                if (!isEffectActive() || renderStyleRef.current !== 'clay') return;
                invalidateClayMaterialSnapshot(model);
                const orig = Number(clayMaterialParamsRef.current?.clayOriginalColorBlend) || 0;
                if (orig > 0 && orig < 1) {
                  setClayLocalIdsReadyNonce((nonce) => nonce + 1);
                }
              });
              await populateFragmentsIdCache(model, idCacheRef.current, ids);
              if (renderStyleRef.current === 'clay') {
                setClayLocalIdsReadyNonce((nonce) => nonce + 1);
              }
            } catch (error) {
              if (!disposed && !isStaleFragmentsLifecycleError(error)) {
                setRenderError(error?.message || 'Could not build BIM ID cache.');
              }
            }
          }).catch((error) => {
            if (!disposed && !isStaleFragmentsLifecycleError(error)) {
              setRenderError(error?.message || 'Could not read BIM local IDs.');
            }
          });
          [0, 50, 150, 350, 750, 1500, 3000].forEach((waitMs) => {
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
          setRenderError(isFragmentsModelNotFound(error)
            ? 'Fragments worker lost the model during load. Reload or rebuild the BIM cache.'
            : error?.message || 'Could not load Fragments model.');
          setLoadState('error');
        }
      }
    }

    const renderViewportFrame = () => {
      if (disposed || !cameraRef.current) return;
      if (scene.overrideMaterial) scene.overrideMaterial = null;
      syncMeasurementOverlay();
      const activeCamera = cameraRef.current;
      const wireframeEdges = wireframeEdgesRef.current;
      const overlayScene = wireframeOverlaySceneRef.current;
      const bounds = modelBoundsRef.current;
      const cameraDistance = resolveBimViewDistance(activeCamera, controlsRef.current, bounds);

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
          hiddenLines: wfStyle.hiddenLines,
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
          backgroundColor: viewportBackgroundRef.current,
          aoIntensity: clayStyle.aoIntensity,
          aoRadius: clayStyle.aoRadius,
          aoBias: clayStyle.aoBias,
          aoDistance: clayStyle.aoDistance,
          aoSamples: clayStyle.aoSamples,
          aoResolution: clayStyle.aoResolution,
          cameraDistance,
          modelRadius: bounds?.radius,
          boundsCenter: bounds?.center,
        });
      } else if (wireframeModeRef.current && wireframeEdges?.parent && overlayScene) {
        applyViewportBackground(scene, renderer, viewportBackgroundRef.current);
        const style = wireframeStyleRef.current;
        renderWireframeOverlay(renderer, scene, overlayScene, activeCamera, wireframeEdges, {
          cameraDistance,
          modelRadius: bounds?.radius,
          lineWeight: style.lineWeight,
          opacity: style.opacity,
          color: style.color,
          hiddenLines: style.hiddenLines,
        });
      } else {
        applyViewportBackground(scene, renderer, viewportBackgroundRef.current);
        renderer.render(scene, activeCamera);
      }

      const sectionGroup = sectionOverlayGroupRef.current;
      if (sectionStateRef.current?.enabled && sectionGroup && sectionOverlaySceneRef.current) {
        const { width, height } = getRendererDrawingSize(renderer);
        updateSectionOverlayStyle(sectionGroup, sectionStateRef.current, {
          width,
          height,
          cameraDistance,
          modelRadius: bounds?.radius,
        });
        renderSectionOverlayPass(renderer, sectionOverlaySceneRef.current, activeCamera, {
          mainScene: scene,
          refreshDepth: true,
        });
      }

      measurementOverlayRef.current?.render(scene, activeCamera);
    };

    let animateStarted = false;
    let lastFrameTime = performance.now();
    const startAnimateLoop = () => {
      if (animateStarted || disposed) return;
      animateStarted = true;
      lastFrameTime = performance.now();
      animate();
    };

    const animate = () => {
      if (disposed) return;
      const now = performance.now();
      const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.1);
      lastFrameTime = now;
      keyboardNav.update(deltaSeconds);
      controls.update();
      const hasLayerFilter = hiddenStoreysRef.current.length > 0 || hiddenLayersRef.current.length > 0;
      const hasSectionClip = sectionStateRef.current?.enabled === true;

      if (shouldSkipClayFragmentFrameLoop()) {
        if (wireframeModeRef.current && wireframeEdgesRef.current) {
          ensureWireframeEdgesAttached(
            wireframeOverlaySceneRef.current,
            modelRef.current?.object ?? null,
            wireframeEdgesRef.current,
          );
        }
        renderViewportFrame();
        animationRef.current = window.requestAnimationFrame(animate);
        return;
      }

      if (modelReadyRef.current && !updatePending) {
        updatePending = true;
        updatePendingStartedAt = performance.now();
        void Promise.race([
          updateFragments(false, { retryModelRegistration: true }),
          delay(FRAGMENTS_UPDATE_FRAME_TIMEOUT_MS),
        ])
          .then(async () => {
            await reapplyClayMaterialsAfterUpdate();
            await reapplyLayerStoreyVisibilityAfterUpdate();
          })
          .catch((error) => {
            if (!disposed && !isStaleFragmentsLifecycleError(error)) {
              setRenderError(error?.message || 'Could not update BIM view.');
            }
          })
          .finally(() => {
            updatePending = false;
            if (wireframeModeRef.current && wireframeEdgesRef.current) {
              ensureWireframeEdgesAttached(
                wireframeOverlaySceneRef.current,
                modelRef.current?.object ?? null,
                wireframeEdgesRef.current,
              );
            }
            renderViewportFrame();
            if (!disposed) animationRef.current = window.requestAnimationFrame(animate);
          });
        return;
      }

      if (
        updatePending
        && performance.now() - updatePendingStartedAt > FRAGMENTS_UPDATE_FRAME_TIMEOUT_MS
      ) {
        updatePending = false;
      }

      if (updatePending && (hasLayerFilter || hasSectionClip)) {
        animationRef.current = window.requestAnimationFrame(animate);
        return;
      }

      renderViewportFrame();
      animationRef.current = window.requestAnimationFrame(animate);
    };

    void loadFragments();

    return () => {
      disposed = true;
      modelReadyRef.current = false;
      loadedFragmentsModelIdRef.current = null;
      updateFragmentsRef.current = null;
      resizeAndRefreshRef.current = null;
      viewportSizedRef.current = false;
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
      sectionRebuildSeqRef.current += 1;
      if (sectionOverlayDebounceRef.current) {
        window.clearTimeout(sectionOverlayDebounceRef.current);
        sectionOverlayDebounceRef.current = null;
      }
      disposeWireframeEdges(wireframeEdgesRef.current);
      wireframeEdgesRef.current = null;
      disposeSectionOverlay(sectionOverlayGroupRef.current);
      sectionOverlayGroupRef.current = null;
      activeClippingPlanesRef.current = [];
      disposeClayComposer(clayComposerRef.current);
      clayComposerRef.current = null;
      teardownClayLighting(sceneRef.current, clayLightingStateRef.current);
      clayLightingStateRef.current = null;
      const fragmentsToDispose = fragmentsRef.current;
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeAndRefresh);
      controls.removeEventListener('end', emitSceneCameraChange);
      keyboardNav.dispose();
      keyboardNavRef.current = null;
      pointerWalkTargetRef.current = null;
      pointerWalkRaycastSeqRef.current += 1;
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
      sectionOverlaySceneRef.current = null;
      fragmentsRef.current = null;
      modelRef.current = null;
      localIdsRef.current = [];
      idCacheRef.current = createFragmentsIdCache();
      void Promise.resolve(fragmentsToDispose?.dispose?.()).catch(() => {});
    };
  }, [fitModel, preparedModelKey, rebuildWireframeEdges, syncMeasurementOverlay]);

  useEffect(() => {
    if (loadState !== 'ready' || !modelReadyRef.current) return undefined;

    const refresh = () => resizeAndRefreshRef.current?.();
    refresh();
    const rafId = window.requestAnimationFrame(refresh);
    const timers = [0, 50, 150, 350, 750, 1500, 3000].map((delayMs) => window.setTimeout(refresh, delayMs));

    return () => {
      window.cancelAnimationFrame(rafId);
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [loadState, preparedModelKey]);

  useEffect(() => {
    if (loadState !== 'ready' || !modelReadyRef.current) return;
    void updateFragmentsRef.current?.(true, { retryModelRegistration: true }).catch((error) => {
      if (!isStaleFragmentsLifecycleError(error)) {
        setRenderError(error?.message || 'Could not update BIM view.');
      }
    });
  }, [loadState, renderStyle]);

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

    void applyLighting().finally(() => {
      if (seq !== lightingApplySeqRef.current) return;
      if (renderStyleRef.current === 'clay') return;
      applyViewportBackground(scene, renderer, viewportBackgroundRef.current);
    });

    return () => {
      lightingApplySeqRef.current += 1;
    };
  }, [loadState, showEnvironment, lightingMode, environmentPreset, renderStyle, viewportBackgroundColor]);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer || loadState !== 'ready') return;
    applyViewportBackground(scene, renderer, viewportBackgroundColor);
  }, [viewportBackgroundColor, loadState]);

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
      backgroundColor: viewportBackgroundColor,
      lightIntensity: clayLightIntensity,
    });
    const { width, height } = getRendererLogicalSize(renderer);
    disposeClayComposer(clayComposerRef.current);
    clayComposerRef.current = createClayComposer(renderer, scene, camera, width, height);
    updateClaySsaoQuality(clayComposerRef.current, {
      aoSamples: clayAoSamples,
      aoResolution: clayAoResolution,
    });

    return () => {
      teardownClayLighting(scene, clayLightingStateRef.current);
      clayLightingStateRef.current = null;
      disposeClayComposer(clayComposerRef.current);
      clayComposerRef.current = null;
    };
  }, [clayLightIntensity, loadState, renderStyle, viewportBackgroundColor]);

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
      const normalizedDisplayMode = displayMode === 'isolate' ? 'highlight' : displayMode;
      const effectiveDisplayMode = isClay && normalizedDisplayMode === 'colorBy' ? 'highlight' : normalizedDisplayMode;
      const ghostMaterial = isClay ? CLAY_GHOST_MATERIAL : GHOST_MATERIAL;
      const selectedMaterial = isClay ? CLAY_SELECTED_MATERIAL : SELECTED_MATERIAL;
      const queryBatchIsolate = queryViewerMode === 'isolate' && highlightElementIds.length > 0;
      const selectionIsolate = isolateOnSelect && Boolean(selectedElement);
      const shouldIsolate = queryBatchIsolate || selectionIsolate;
      const needsVisibilityReset = shouldIsolate
        || effectiveDisplayMode === 'ghostOthers'
        || effectiveDisplayMode === 'colorBy'
        || (isolateOnSelect && !selectedElement)
        || (!shouldIsolate && effectiveDisplayMode === 'highlight');
      if (!isClay) {
        await model.resetHighlight();
      }
      if (needsVisibilityReset) await model.resetVisible();
      timer.mark('reset');
      if (!shouldApplySelectionRun(runSeq, applySelectionSeqRef.current)) return;

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
        if (!shouldApplySelectionRun(runSeq, applySelectionSeqRef.current)) return;
        await applyBimLayerStoreyVisibility(model, preparedModel, cache, { hiddenStoreys, hiddenLayers });
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
      } else if (shouldIsolate) {
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

      if (!shouldApplySelectionRun(runSeq, applySelectionSeqRef.current)) return;
      await applyBimLayerStoreyVisibility(model, preparedModel, cache, { hiddenStoreys, hiddenLayers });

      timer.mark('highlight');
      timer.finish({ displayMode, targetCount: targetElements.length, localIdCount: localIds.length });
    }

    void applySelection().catch((error) => {
      if (shouldApplySelectionRun(runSeq, applySelectionSeqRef.current) && !isStaleFragmentsLifecycleError(error)) {
        setRenderError(error?.message || 'Could not apply BIM selection.');
      }
    });
  }, [
    colorByProperty,
    displayMode,
    isolateOnSelect,
    hiddenStoreys,
    hiddenLayers,
    highlightElementIds,
    queryViewerMode,
    loadState,
    preparedModel,
    renderStyle,
    selectedElement,
    selectionRefreshNonce,
  ]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || !modelReadyRef.current || loadState !== 'ready' || renderStyle !== 'clay') return undefined;

    const debounceTimer = globalThis.setTimeout(() => {
      const runSeq = ++clayApplySeqRef.current;

      async function applyClayMaterials() {
        const shouldCancel = () => runSeq !== clayApplySeqRef.current;
        const waitDeadline = Date.now() + 3000;
        while (clayApplyInFlightRef.current && Date.now() < waitDeadline) {
          if (shouldCancel()) return;
          await delay(16);
        }
        if (shouldCancel()) return;
        if (clayApplyInFlightRef.current) {
          clayApplyInFlightRef.current = false;
        }
        clayApplyInFlightRef.current = true;
        publishClayDebugMarker({
          source: 'effect',
          phase: 'clayMaterialsEffect',
          ok: null,
          status: 'starting',
          runSeq,
        });
        const timer = createClayApplyTimer('clayMaterialsEffect');
        try {
          let allLocalIds = localIdsRef.current.length > 0 ? localIdsRef.current : await model.getLocalIds();
          if (!allLocalIds?.length) {
            await delay(50);
            allLocalIds = localIdsRef.current.length > 0 ? localIdsRef.current : await model.getLocalIds();
          }
          localIdsRef.current = allLocalIds ?? [];
          if (shouldCancel()) {
            return;
          }
          if (!allLocalIds?.length) {
            publishClayDebugMarker({
              source: 'effect',
              phase: 'clayMaterialsEffect',
              ok: false,
              reason: 'empty-local-ids',
              runSeq,
            });
            return;
          }
          timer.mark('local-ids');
          const { originalColorBlend } = resolveClayMaterialApplyParams(clayMaterialParamsRef.current);
          const blendOnly = canReuseClayBlendFastPath(model, allLocalIds, originalColorBlend);
          const result = await applyClayViewportMaterials(
            model,
            preparedModelRef.current,
            idCacheRef.current,
            allLocalIds,
            clayMaterialParamsRef.current,
            {
              updateFragments: updateFragmentsRef.current,
              debugSource: 'effect',
              blendOnly,
              shouldCancel,
              quietDebug: true,
            },
          );
          if (shouldCancel()) {
            return;
          }
          applyViewportBackground(sceneRef.current, rendererRef.current, viewportBackgroundRef.current);
          timer.finish({
            source: 'effect',
            ok: result.ok,
            runSeq,
            stats: result.stats,
            updateBeforeOk: result.updateBeforeOk,
            updateAfterOk: result.updateAfterOk,
            blendOnly: result.blendOnly,
            localIdsCount: result.localIdsCount,
            totalMs: result.totalMs,
          });
        } catch (error) {
          if (!shouldCancel()) {
            publishClayDebugMarker({
              source: 'effect',
              phase: 'clayMaterialsEffect',
              ok: false,
              runSeq,
              error: error?.message ?? String(error),
            });
          }
          throw error;
        } finally {
          clayApplyInFlightRef.current = false;
        }
      }

      void applyClayMaterials().catch((error) => {
        clayApplyInFlightRef.current = false;
        if (runSeq === clayApplySeqRef.current && !isStaleFragmentsLifecycleError(error)) {
          setRenderError(error?.message || 'Could not apply clay materials.');
        }
      });
    }, 0);

    return () => {
      globalThis.clearTimeout(debounceTimer);
      ++clayApplySeqRef.current;
    };
  }, [
    clayGlassOpacity,
    clayOriginalColorBlend,
    claySurfaceColor,
    clayLocalIdsReadyNonce,
    loadState,
    renderStyle,
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
    void updateFragmentsRef.current?.(true, { retryModelRegistration: true });
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
      void updateFragmentsRef.current?.(true, { retryModelRegistration: true });
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

  const handleToggleLayersHud = useCallback(() => {
    setLayersHudOpen((open) => !open);
  }, []);

  const handleToggleHiddenStorey = useCallback((storeyId) => {
    onHiddenStoreysChange(
      hiddenStoreys.includes(storeyId)
        ? hiddenStoreys.filter((id) => id !== storeyId)
        : [...hiddenStoreys, storeyId],
    );
  }, [hiddenStoreys, onHiddenStoreysChange]);

  const handleToggleHiddenLayer = useCallback((layerId) => {
    onHiddenLayersChange(
      hiddenLayers.includes(layerId)
        ? hiddenLayers.filter((id) => id !== layerId)
        : [...hiddenLayers, layerId],
    );
  }, [hiddenLayers, onHiddenLayersChange]);

  const handleShowAllStoreys = useCallback(() => {
    onHiddenStoreysChange([]);
  }, [onHiddenStoreysChange]);

  const handleHideAllStoreys = useCallback(() => {
    onHiddenStoreysChange(layerCatalog.storeys.map((entry) => entry.id));
  }, [layerCatalog.storeys, onHiddenStoreysChange]);

  const handleShowAllLayers = useCallback(() => {
    onHiddenLayersChange([]);
  }, [onHiddenLayersChange]);

  const handleHideAllLayers = useCallback(() => {
    onHiddenLayersChange(layerCatalog.layers.map((entry) => entry.id));
  }, [layerCatalog.layers, onHiddenLayersChange]);

  const handleToggleSectionHud = useCallback(() => {
    setSectionHudOpen((open) => !open);
  }, []);

  const handlePatchSection = useCallback((patch) => {
    applyLiveSectionState(normalizeBimSectionState({
      ...normalizedSection,
      ...patch,
      planes: patch.planes ?? normalizedSection.planes,
    }, { defaultPlaneY: sectionHeightRangeFromBounds(viewportBounds).defaultY }), {
      rebuildOverlay: patch.enabled !== false,
      delayMs: patch.enabled === false ? 0 : 32,
    });
  }, [applyLiveSectionState, normalizedSection, viewportBounds]);

  const handleSetPlaneHeight = useCallback((y) => {
    applyLiveSectionState(
      patchPrimaryPlaneHeight(normalizedSection, y, viewportBounds),
      { rebuildOverlay: true, delayMs: 32 },
    );
  }, [applyLiveSectionState, normalizedSection, viewportBounds]);

  const handleFlipPlane = useCallback(() => {
    applyLiveSectionState(flipPrimaryPlaneNormal(normalizedSection), { rebuildOverlay: true, delayMs: 0 });
  }, [applyLiveSectionState, normalizedSection]);

  const handleApplyStoreyPreset = useCallback((y) => {
    applyLiveSectionState(
      patchPrimaryPlaneHeight(normalizedSection, y, viewportBounds),
      { rebuildOverlay: true, delayMs: 0 },
    );
  }, [applyLiveSectionState, normalizedSection, viewportBounds]);

  const handleToggleClay = useCallback(() => {
    onRenderStyleChange(renderStyle === 'clay' ? 'standard' : 'clay');
  }, [onRenderStyleChange, renderStyle]);

  const handleToggleGhost = useCallback(() => {
    onDisplayModeChange(displayMode === 'ghostOthers' ? 'highlight' : 'ghostOthers');
  }, [displayMode, onDisplayModeChange]);

  const handleToggleIsolateOnSelect = useCallback(() => {
    onIsolateOnSelectChange(!isolateOnSelect);
  }, [isolateOnSelect, onIsolateOnSelectChange]);

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
      <div className="shrink-0 border-b border-border bg-surface">
        <div className="flex items-center justify-between px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted truncate">
          {measureStatus ?? (selectedElement
            ? 'Left-click empty space or Esc to deselect · Right-drag orbit · Middle-drag pan'
            : `IFC Fragments View - ${total} elements · Left-click select · Right-drag orbit · Middle-drag pan`)}
        </div>
        <div className="flex items-center">
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
          </div>
          <BimViewportToolbarSeparator />
          <div className="flex items-center gap-1">
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
          </div>
          <BimViewportToolbarSeparator />
          <div className="flex items-center gap-1">
          <button type="button" title="Reset visibility" onClick={resetVisibility} className="rounded border border-border p-1 text-secondary hover:bg-surface-muted">
            <RotateCcw size={14} strokeWidth={1.7} />
          </button>
          <button type="button" title="Fit to model" onClick={fitModel} className="rounded border border-border p-1 text-secondary hover:bg-surface-muted">
            <LocateFixed size={14} strokeWidth={1.7} />
          </button>
          </div>
          <BimViewportToolbarSeparator />
          <div className="flex items-center gap-1">
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
          </div>
          <BimViewportToolbarSeparator />
          <div className="flex items-center gap-1">
          <button
            type="button"
            title="Wireframe overlay (visible edges)"
            onClick={handleToggleWireframe}
            className={`rounded border border-border p-1 ${wireframeMode ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
          >
            <Grid3x3 size={14} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            title="Clay render (Arctic)"
            onClick={handleToggleClay}
            className={`rounded border border-border p-1 ${
              renderStyle === 'clay' ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'
            }`}
            aria-pressed={renderStyle === 'clay'}
            aria-label="Clay render (Arctic)"
          >
            <Circle size={14} strokeWidth={1.7} />
          </button>
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
            title={displayMode === 'ghostOthers' ? 'Show all (exit ghost)' : 'Ghost others'}
            onClick={handleToggleGhost}
            className={`rounded border border-border p-1 ${displayMode === 'ghostOthers' ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
            aria-pressed={displayMode === 'ghostOthers'}
            aria-label={displayMode === 'ghostOthers' ? 'Exit ghost mode' : 'Ghost others'}
          >
            <Ghost size={14} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            title={isolateOnSelect ? 'Disable isolate on select' : 'Isolate selected element'}
            onClick={handleToggleIsolateOnSelect}
            className={`rounded border border-border p-1 ${isolateOnSelect ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
            aria-pressed={isolateOnSelect}
            aria-label={isolateOnSelect ? 'Disable isolate on select' : 'Isolate selected element'}
          >
            <EyeOff size={14} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            title={styleHudOpen ? 'Hide style settings' : 'Show style settings'}
            onClick={() => setStyleHudOpen((open) => !open)}
            className={`rounded border border-border p-1 ${styleHudOpen ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
            aria-pressed={styleHudOpen}
            aria-label={styleHudOpen ? 'Hide style settings panel' : 'Show style settings panel'}
          >
            <SlidersHorizontal size={14} strokeWidth={1.7} />
          </button>
          </div>
          <BimViewportToolbarSeparator />
          <div className="flex items-center gap-1">
          <button
            type="button"
            title={bqlHudOpen ? 'Hide BQL query' : 'Show BQL query'}
            onClick={() => setBqlHudOpen((open) => !open)}
            className={`rounded border border-border p-1 ${bqlHudOpen ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
            aria-pressed={bqlHudOpen}
            aria-label={bqlHudOpen ? 'Hide BQL query panel' : 'Show BQL query panel'}
          >
            <Braces size={14} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            title={agentHudOpen ? 'Hide BIM agent' : 'Show BIM agent'}
            onClick={() => setAgentHudOpen((open) => !open)}
            className={`rounded border border-border p-1 ${agentHudOpen ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
            aria-pressed={agentHudOpen}
            aria-label={agentHudOpen ? 'Hide BIM agent panel' : 'Show BIM agent panel'}
          >
            <Bot size={14} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            title={sectionHudOpen ? 'Hide section panel' : 'Section cut'}
            onClick={handleToggleSectionHud}
            className={`rounded border border-border p-1 ${sectionHudOpen ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
            aria-pressed={sectionHudOpen}
            aria-label={sectionHudOpen ? 'Hide section panel' : 'Show section panel'}
          >
            <Slice size={14} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            title={layersHudOpen ? 'Hide layers panel' : 'IFC layers and storeys'}
            onClick={handleToggleLayersHud}
            className={`rounded border border-border p-1 ${layersHudOpen ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
            aria-pressed={layersHudOpen}
            aria-label={layersHudOpen ? 'Hide layers panel' : 'Show layers panel'}
          >
            <Layers size={14} strokeWidth={1.7} />
          </button>
          </div>
        </div>
        </div>
      </div>
      <div
        ref={containerRef}
        tabIndex={0}
        className="flex-1 min-h-0 relative overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />
        {loadState === 'loading' && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-preview-bg/85 backdrop-blur-sm px-6 text-center"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div
              className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
              aria-hidden
            />
            <div className="text-sm text-primary">{loadPhase}</div>
            {loadDetail && (
              <div className="mt-1 text-[11px] text-muted">{loadDetail}</div>
            )}
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
        {loadState === 'ready' && (layersHudOpen || sectionHudOpen) && (
          <div className="pointer-events-none absolute left-3 top-3 z-20 flex w-[min(calc(100%-1.5rem),18rem)] flex-col gap-2">
            {layersHudOpen && (
              <BimLayersHud
                catalog={layerCatalog}
                hiddenStoreys={hiddenStoreys}
                hiddenLayers={hiddenLayers}
                onToggleStorey={handleToggleHiddenStorey}
                onToggleLayer={handleToggleHiddenLayer}
                onShowAllStoreys={handleShowAllStoreys}
                onHideAllStoreys={handleHideAllStoreys}
                onShowAllLayers={handleShowAllLayers}
                onHideAllLayers={handleHideAllLayers}
              />
            )}
            {sectionHudOpen && (
              <BimSectionHud
                section={normalizedSection}
                bounds={viewportBounds}
                preparedModel={preparedModel}
                catalogStoreys={layerCatalog.storeys}
                onPatchSection={handlePatchSection}
                onSetPlaneHeight={handleSetPlaneHeight}
                onFlipPlane={handleFlipPlane}
                onApplyStoreyPreset={handleApplyStoreyPreset}
              />
            )}
          </div>
        )}
        {loadState === 'ready' && (agentHudOpen || bqlHudOpen || styleHudOpen) && (
          <div className="pointer-events-none absolute right-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[min(calc(100%-1.5rem),24rem)] flex-col items-stretch gap-2 overflow-y-auto">
            {agentHudOpen && (
              <BimAgentHud
                agentText={agentText}
                onAgentTextChange={onAgentTextChange}
                responderId={agentResponderId}
                onResponderIdChange={onAgentResponderIdChange}
                selectedResponderLabel={agentSelectedResponderLabel}
                responderLabel={agentResponderLabel}
                providerStatus={agentProviderStatus}
                agentRunState={agentRunState}
                agentResponse={agentResponse}
                statusLine={agentStatusLine}
                onAskSelectedResponder={onAskSelectedAgent}
                onRefreshAgentProviderState={onRefreshAgentProviderState}
                selectedConnector={selectedAgentConnector}
              />
            )}
            {bqlHudOpen && (
              <BimBqlHud
                queryText={bqlQueryText}
                onQueryTextChange={onBqlQueryTextChange}
                selectedSavedQueryId={bqlSelectedSavedQueryId}
                savedQueries={bqlSavedQueries}
                rebuildDisabled={bqlRebuildDisabled}
                statusLine={bqlStatusLine}
                statusIsError={bqlStatusIsError}
                onRunQuery={onBqlRunQuery}
                onSaveQuery={onBqlSaveQuery}
                onClearQuery={onBqlClearQuery}
                onDeleteSelectedQuery={onBqlDeleteSelectedQuery}
                onRebuildCache={onBqlRebuildCache}
                onApplyPreset={onBqlApplyPreset}
                onLoadSavedQuery={onBqlLoadSavedQuery}
              />
            )}
            {styleHudOpen && (
              <BimStyleSettingsHud
                renderStyle={renderStyle}
                viewportBackgroundColor={viewportBackgroundColor}
                onViewportBackgroundChange={onViewportBackgroundChange}
                showEnvironment={showEnvironment}
                environmentPreset={environmentPreset}
                onToggleLighting={handleToggleLighting}
                projectId={projectId}
                cardId={cardId}
                artifactId={artifactId}
                styleSettings={styleSettings}
                onApplyStyleSettings={onApplyStyleSettings}
                wireframeMode={wireframeMode}
                clayAoIntensity={clayAoIntensity}
                clayAoRadius={clayAoRadius}
                clayAoBias={clayAoBias}
                clayAoDistance={clayAoDistance}
                clayAoSamples={clayAoSamples}
                clayAoResolution={clayAoResolution}
                clayLightIntensity={clayLightIntensity}
                claySurfaceColor={claySurfaceColor}
                clayGlassOpacity={clayGlassOpacity}
                clayOriginalColorBlend={clayOriginalColorBlend}
                onClayStyleChange={onClayStyleChange}
                wireframeLineWeight={wireframeLineWeight}
                wireframeOpacity={wireframeOpacity}
                wireframeColor={wireframeColor}
                wireframeHiddenLines={wireframeHiddenLines}
                onWireframeStyleChange={onWireframeStyleChange}
              />
            )}
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

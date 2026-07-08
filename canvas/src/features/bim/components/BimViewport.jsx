import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Axis3D, Box, Bot, BoxSelect, Braces, CalendarDays, Camera, Circle, DollarSign, EyeOff, Ghost, Grid3x3, Images, Layers, Palette, PanelLeft, PanelLeftClose, PanelRight, PanelRightClose, RotateCcw, Slice, SlidersHorizontal, SunMedium } from 'lucide-react';
import { MOUSE } from 'three';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FragmentsModels, RenderedFaces } from '@thatopen/fragments';
import fragmentsWorkerUrl from '@thatopen/fragments/dist/Worker/worker.mjs?url';
import {
  buildFootprintOrientedBounds,
  fitCameraToViewPreset,
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
import { endAxisViewOrbitLock } from '../bim-core/bimAxisViewOrbit.js';
import { createBimMeasurementController } from '../bim-core/bimMeasurementController.js';
import { createBimMeasurementOverlay } from '../bim-core/bimMeasurementOverlay.js';
import { pickRlMarkerFromOverlay } from '../bim-core/bimRlMarkerPick.js';
import { cycleBimLightingState } from '../bim-core/bimLighting.js';
import { BimStyleSettingsHud } from './BimStyleSettingsHud.jsx';
import { BimStylePresetsMenu } from './BimStylePresetsMenu.jsx';
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
  disposeModelBoundingBoxEdges,
  renderOverlayScenePass,
  syncModelBoundingBoxEdges,
} from '../bim-core/bimBoundingBoxOverlay.js';
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
  updateClaySunDirection,
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
  applyColorByHighlight,
  BIM_COLOR_BY_DEFAULT_PROPERTY,
} from '../bim-core/bimColorBy.js';
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
import { BimSunStudyHud } from './BimSunStudyHud.jsx';
import { BimViewCarousel } from './BimViewCarousel.jsx';
import { BimViewNavigatorGimbal } from './BimViewNavigatorGimbal.jsx';
import { captureBimViewportThumbnail } from '../bim-core/bimViewportCapture.js';
import { BimSelectedElementHud } from './BimSelectedElementHud.jsx';
import { Bim4dHud } from './Bim4dHud.jsx';
import { Bim5dHud } from './Bim5dHud.jsx';
import {
  applyBimSunLighting,
  createBimSunLightingAdapter,
  disposeBimSunLightingAdapter,
} from '../bim-core/bimSunLighting.js';
import {
  applyBimViewportToolbarLayout,
  BIM_VIEWPORT_GIMBAL_RESERVE_CLASS,
  BIM_VIEWPORT_TOOLBAR_SURFACE_CLASS,
  readBimViewportHudTopPx,
  resolveBimLayersHudMaxHeightPx,
} from '../bim-core/bimViewportLayout.js';
import {
  resolveSunDirection,
  resolveSunFromEnvironmentalState,
} from '../bim-core/bimSunStudy.js';
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
  normalizeLayersHudHeight,
  normalizeLayersHudStoreysHeight,
  VIEWPORT_BACKGROUND_DEFAULT,
} from '../bim-core/types.js';
import {
  BIM_VIEWPORT_LOAD_PHASES,
  FRAGMENTS_BOOT_IDLE_TIMEOUT_MS,
  FRAGMENTS_MODEL_REGISTRATION_RETRY_DELAYS_MS,
  configureFragmentsManagerForBimViewport,
  hasViewportLayoutSize,
  isFragmentsModelNotFoundError,
  isFragmentsModelRegistered,
  loadFragmentsModelWithRetries,
  primeViewportRendererForBoot,
  resetFragmentsBootUpdateQueue,
  resolveBimViewportRuntimeModelId,
  syncFragmentsForViewportBoot,
  waitForAnimationFrame,
  waitForFragmentsModelIdle,
  waitForFragmentsModelRegistered,
  waitForViewportLayout,
} from '../bim-core/bimViewportBoot.js';

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

function BimViewportToolbarSeparator() {
  return (
    <div
      className="mx-3 h-5 w-px shrink-0 bg-border"
      role="separator"
      aria-orientation="vertical"
    />
  );
}

function isEditableKeyboardTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return tagName === 'INPUT'
    || tagName === 'TEXTAREA'
    || tagName === 'SELECT'
    || target.isContentEditable;
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
  layersHudHeight,
  onLayersHudHeightChange = () => {},
  layersHudStoreysHeight,
  onLayersHudStoreysHeightChange = () => {},
  initialCamera = null,
  projectionMode = 'perspective',
  onToggleLeftPanel = () => {},
  onToggleRightPanel = () => {},
  onDisplayModeChange,
  onColorByPropertyChange = () => {},
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
  rlDatum = null,
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
  environmentalAnalysis = null,
  onMeasurementsChange = () => {},
  onMeasureUnitsChange = () => {},
  onMeasureSnapModeChange = () => {},
  onMeasureKindChange = () => {},
  onMeasurementsVisibleChange = () => {},
  onRlDatumChange = () => {},
  onDeleteRlDatum = () => {},
  onWireframeModeChange = () => {},
  onWireframeStyleChange = () => {},
  onRenderStyleChange = () => {},
  onClayStyleChange = () => {},
  onResetClayDefaults = () => {},
  onViewportBackgroundChange = () => {},
  onLightingChange = () => {},
  onEnvironmentalAnalysisChange = () => {},
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
  agentChatMessages = [],
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
  savedResultSets = [],
  bim4dSequences = [],
  active4dSequenceId = null,
  active4dTaskId = null,
  onCreateResultSet = () => {},
  onCreate4dSequence = () => {},
  onCreate4dTask = () => {},
  onSetActive4dSequence = () => {},
  onSetActive4dTask = () => {},
  onStep4dTask = () => {},
  bim5dCostPlans = [],
  active5dCostPlanId = null,
  onCreate5dCostPlan = () => {},
  onSetActive5dCostPlan = () => {},
  onPatch5dCostPlan = () => {},
  onAdd5dRateRow = () => {},
  onSelect5dTakeoffRow = () => {},
  viewCarouselOpen = false,
  onToggleViewCarousel = () => {},
  viewApplyRequest = null,
  viewportCaptureRef = null,
  viewSets = [],
  activeViewSetId = null,
  activeViewId = null,
  viewSetsBusy = false,
  viewSetsStatus = '',
  viewSetsError = '',
  onSelectViewSet = () => {},
  onCreateViewSet = () => {},
  onRenameViewSet = () => {},
  onDeleteViewSet = () => {},
  onSaveCurrentView = () => {},
  onApplyView = () => {},
  onRenameView = () => {},
  onUpdateView = () => {},
  onDeleteView = () => {},
  loadViewThumbnail = async () => null,
}) {
  const total = preparedModel?.elements?.length ?? 0;
  const loadDetail = total > 0 ? `${total.toLocaleString()} elements` : null;
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const viewCarouselPanelRef = useRef(null);
  const layersHudResizeRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const cameraQuaternionRef = useRef(new THREE.Quaternion());
  const cameraViewDirectionRef = useRef(new THREE.Vector3(1, 0.65, 1).normalize());
  const controlsRef = useRef(null);
  const toolbarControlsRef = useRef(null);
  const gimbalChromeRef = useRef(null);
  const [toolbarHeightPx, setToolbarHeightPx] = useState(32);
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
  const viewApplyTokenRef = useRef(null);
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
  const rlDatumRef = useRef(rlDatum);
  const measureHudOpenRef = useRef(false);
  const measureEditModeRef = useRef(false);
  const selectedRlPickRef = useRef(null);
  const highlightedHudItemRef = useRef(null);
  const rlMarkerRaycasterRef = useRef(new THREE.Raycaster());
  const dismissMeasureSessionRef = useRef(() => {});
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
  const onRlDatumChangeRef = useRef(onRlDatumChange);
  const onDeleteRlDatumRef = useRef(onDeleteRlDatum);
  const showEnvironmentRef = useRef(showEnvironment);
  const lightingModeRef = useRef(lightingMode);
  const environmentPresetRef = useRef(environmentPreset);
  const legacyLightsRef = useRef(null);
  const directLightsRef = useRef(null);
  const sunLightingRef = useRef(null);
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
  const environmentalAnalysisRef = useRef(environmentalAnalysis);
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
  const boundingBoxModeRef = useRef(false);
  const boundingBoxEdgesRef = useRef(null);
  const syncBoundingBoxOverlayRef = useRef(() => {});
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
  const [measureHudOpen, setMeasureHudOpen] = useState(false);
  const [measureEditMode, setMeasureEditMode] = useState(false);
  const [selectedRlPick, setSelectedRlPick] = useState(null);
  const [measureDraftActive, setMeasureDraftActive] = useState(false);
  const measureDraftActiveRef = useRef(false);
  const [cancelDraftNonce, setCancelDraftNonce] = useState(0);
  const [styleHudOpen, setStyleHudOpen] = useState(false);
  const [agentHudOpen, setAgentHudOpen] = useState(false);
  const [bqlHudOpen, setBqlHudOpen] = useState(false);
  const [fourDHudOpen, setFourDHudOpen] = useState(false);
  const [fiveDHudOpen, setFiveDHudOpen] = useState(false);
  const [layersHudOpen, setLayersHudOpen] = useState(false);
  const [layersHudMaxHeight, setLayersHudMaxHeight] = useState(null);
  const [sectionHudOpen, setSectionHudOpen] = useState(false);
  const [sunStudyHudOpen, setSunStudyHudOpen] = useState(false);
  const [boundingBoxMode, setBoundingBoxMode] = useState(false);
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
  const syncBoundingBoxOverlay = useCallback(() => {
    if (!boundingBoxModeRef.current) return;
    const modelRoot = modelRef.current?.object;
    if (!modelRoot) return;
    const overlayScene = wireframeOverlaySceneRef.current;
    if (!overlayScene) return;
    const orientedBounds = buildFootprintOrientedBounds(modelRoot)
      ?? modelBoundsRef.current;
    if (!orientedBounds) return;
    boundingBoxEdgesRef.current = syncModelBoundingBoxEdges(
      boundingBoxEdgesRef.current,
      orientedBounds,
      overlayScene,
    );
  }, []);
  syncBoundingBoxOverlayRef.current = syncBoundingBoxOverlay;

  const syncViewportBounds = useCallback((bounds) => {
    if (bounds) setViewportBounds(bounds);
    syncBoundingBoxOverlay();
  }, [syncBoundingBoxOverlay]);
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
    measureHudOpenRef.current = measureHudOpen;
    if (!measureHudOpen) {
      selectedRlPickRef.current = null;
      setSelectedRlPick(null);
      setMeasureEditMode(false);
    }
  }, [measureHudOpen]);

  useEffect(() => {
    measureDraftActiveRef.current = measureDraftActive;
  }, [measureDraftActive]);

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
    onRlDatumChangeRef.current = onRlDatumChange;
  }, [onRlDatumChange]);

  useEffect(() => {
    onDeleteRlDatumRef.current = onDeleteRlDatum;
  }, [onDeleteRlDatum]);

  useEffect(() => {
    rlDatumRef.current = rlDatum;
  }, [rlDatum]);

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
      if ((event.key === 'Delete' || event.key === 'Backspace') && measureModeActiveRef.current) {
        if (isEditableKeyboardTarget(event.target)) return;
        event.preventDefault();
        dismissMeasureSessionRef.current();
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
      rlDatum: rlDatumRef.current,
      selectedRlPick: selectedRlPickRef.current,
      highlightedHudItem: highlightedHudItemRef.current,
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
      active: measureModeActiveRef.current && !measureEditModeRef.current,
      editMode: measureEditModeRef.current,
      onDeleteDatum: () => {
        rlDatumRef.current = null;
        onDeleteRlDatumRef.current();
        selectedRlPickRef.current = null;
        setSelectedRlPick(null);
        syncMeasurementOverlay();
      },
      onDeleteMeasurement: (measurementId) => {
        const nextMeasurements = measurementsRef.current.filter(
          (entry) => entry.id !== measurementId,
        );
        measurementsRef.current = nextMeasurements;
        onMeasurementsChangeRef.current(nextMeasurements);
        if (selectedRlPickRef.current?.id === measurementId) {
          selectedRlPickRef.current = null;
          setSelectedRlPick(null);
        }
        syncMeasurementOverlay();
      },
    });
  }, []);

  const clearMeasureDraft = useCallback(() => {
    measurementControllerRef.current?.cancelDraft();
    setMeasureDraftActive(false);
    selectedRlPickRef.current = null;
    setSelectedRlPick(null);
    syncMeasurementOverlay();
  }, [syncMeasurementOverlay]);

  const resetMeasureSession = useCallback(() => {
    clearMeasureDraft();
    setMeasureModeActive(false);
    syncMeasurementOverlay();
  }, [clearMeasureDraft, syncMeasurementOverlay]);

  const dismissMeasureSession = useCallback(() => {
    if (measureHudOpenRef.current) {
      clearMeasureDraft();
      return;
    }
    resetMeasureSession();
  }, [clearMeasureDraft, resetMeasureSession]);

  const closeMeasureHud = useCallback(() => {
    resetMeasureSession();
    setMeasureEditMode(false);
    setMeasureHudOpen(false);
  }, [resetMeasureSession]);

  dismissMeasureSessionRef.current = dismissMeasureSession;

  useEffect(() => {
    if (measureHudOpen && !measureModeActive) {
      setMeasureModeActive(true);
    }
  }, [measureHudOpen, measureModeActive]);

  useEffect(() => {
    measurementsVisibleRef.current = measurementsVisible;
    syncMeasurementOverlay();
  }, [measurementsVisible, syncMeasurementOverlay]);

  useEffect(() => {
    measureEditModeRef.current = measureEditMode;
    if (measureEditMode) {
      measurementControllerRef.current?.cancelDraft();
      setMeasureDraftActive(false);
      measurementControllerRef.current?.setActive(false);
    }
    syncMeasurementOverlay();
  }, [measureEditMode, syncMeasurementOverlay]);

  useEffect(() => {
    syncMeasurementOverlay();
  }, [rlDatum, selectedRlPick, syncMeasurementOverlay]);

  const pickRlMarkerAtPointer = useCallback((clientX, clientY) => {
    const overlay = measurementOverlayRef.current;
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!overlay?.group || !camera || !canvas) return null;
    return pickRlMarkerFromOverlay(overlay.group, {
      raycaster: rlMarkerRaycasterRef.current,
      camera,
      canvas,
      clientX,
      clientY,
    });
  }, []);

  const handleRlMarkerSelect = useCallback((pick) => {
    selectedRlPickRef.current = pick;
    setSelectedRlPick(pick);
    syncMeasurementOverlay();
  }, [syncMeasurementOverlay]);

  const handleRlMarkerDelete = useCallback((pick) => {
    if (!pick) return;
    if (pick.kind === 'datum') {
      rlDatumRef.current = null;
      onDeleteRlDatumRef.current();
    } else {
      const nextMeasurements = measurementsRef.current.filter((entry) => entry.id !== pick.id);
      measurementsRef.current = nextMeasurements;
      onMeasurementsChangeRef.current(nextMeasurements);
    }
    selectedRlPickRef.current = null;
    setSelectedRlPick(null);
    syncMeasurementOverlay();
  }, [syncMeasurementOverlay]);

  const emitCameraChange = useCallback(() => {
    const state = serializeBimCameraState(
      cameraRef.current,
      controlsRef.current,
      projectionModeRef.current,
    );
    if (state) onCameraChangeRef.current(state);
  }, []);

  const fitModelToPreset = useCallback((preset = 'home') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const model = modelRef.current;
    const renderer = rendererRef.current;
    if (!camera || !controls || !model?.object) return;
    endAxisViewOrbitLock(controls);
    const size = renderer?.getSize(new THREE.Vector2());
    const aspect = size?.y ? size.x / size.y : (camera.aspect ?? 1);
    const fitOptions = { margin: 1.35, viewportAspect: aspect };
    const fitted = fitCameraToViewPreset(camera, controls, model.object, preset, fitOptions);
    if (!fitted) return;
    syncOrbitControlsAfterCameraFit(controls);
    model.useCamera(camera);
    camera.updateMatrixWorld(true);
    camera.getWorldQuaternion(cameraQuaternionRef.current);
    cameraViewDirectionRef.current.copy(camera.position).sub(controls.target);
    if (cameraViewDirectionRef.current.lengthSq() > 1e-12) {
      cameraViewDirectionRef.current.normalize();
    }
    syncModelBounds(model.object, modelBoundsRef, syncViewportBounds);
    emitCameraChange();
  }, [emitCameraChange, syncViewportBounds]);

  const fitModel = useCallback(() => {
    fitModelToPreset('home');
  }, [fitModelToPreset]);

  const applyViewPreset = useCallback((preset) => {
    fitModelToPreset(preset);
  }, [fitModelToPreset]);

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
    environmentalAnalysisRef.current = environmentalAnalysis;
  }, [environmentalAnalysis]);

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
    boundingBoxModeRef.current = boundingBoxMode;
    if (boundingBoxMode) {
      syncBoundingBoxOverlay();
    } else {
      disposeModelBoundingBoxEdges(boundingBoxEdgesRef.current);
      boundingBoxEdgesRef.current = null;
    }
  }, [boundingBoxMode, syncBoundingBoxOverlay]);

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
    resetFragmentsBootUpdateQueue();
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
      preserveDrawingBuffer: true,
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
      getRlDatum: () => rlDatumRef.current,
      snapMode: measureSnapModeRef.current,
      measureKind: measureKindRef.current,
      onComplete: (record) => {
        const nextMeasurements = normalizeMeasurements([...measurementsRef.current, record]);
        measurementsRef.current = nextMeasurements;
        onMeasurementsChangeRef.current(nextMeasurements);
        syncMeasurementOverlay();
      },
      onDatumComplete: (datum) => {
        rlDatumRef.current = datum;
        onRlDatumChangeRef.current(datum);
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
    sunLightingRef.current = createBimSunLightingAdapter(scene, renderer);

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

          await primeViewportRendererForBoot(renderer, scene, activeCamera);
          if (!isEffectActive()) return;

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
              await delay(750);
              if (disposed || modelRef.current !== model) return;
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

    const syncViewNavigatorState = () => {
      const activeCamera = cameraRef.current;
      const orbitControls = controlsRef.current;
      if (!activeCamera) return;
      activeCamera.updateMatrixWorld(true);
      activeCamera.getWorldQuaternion(cameraQuaternionRef.current);
      const orbitTarget = orbitControls?.target;
      if (orbitTarget) {
        cameraViewDirectionRef.current.copy(activeCamera.position).sub(orbitTarget);
        if (cameraViewDirectionRef.current.lengthSq() > 1e-12) {
          cameraViewDirectionRef.current.normalize();
        }
      }
    };

    const renderViewportFrame = () => {
      if (disposed || !cameraRef.current) return;
      if (scene.overrideMaterial) scene.overrideMaterial = null;
      syncMeasurementOverlay();
      syncViewNavigatorState();
      const activeCamera = cameraRef.current;
      const wireframeEdges = wireframeEdgesRef.current;
      const overlayScene = wireframeOverlaySceneRef.current;
      const bounds = modelBoundsRef.current;
      const cameraDistance = resolveBimViewDistance(activeCamera, controlsRef.current, bounds);
      let overlayRenderedThisFrame = false;

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

      if (
        boundingBoxModeRef.current
        && !boundingBoxEdgesRef.current?.parent
        && modelReadyRef.current
      ) {
        syncBoundingBoxOverlayRef.current();
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
        if (
          wireframeModeRef.current
          && wireframeEdges?.parent
          && overlayScene
        ) {
          overlayRenderedThisFrame = true;
        }
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
        overlayRenderedThisFrame = true;
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

      if (
        !overlayRenderedThisFrame
        && boundingBoxModeRef.current
        && boundingBoxEdgesRef.current?.parent
        && overlayScene
      ) {
        renderOverlayScenePass(renderer, overlayScene, activeCamera);
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
      syncViewNavigatorState();
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
      disposeBimSunLightingAdapter(sunLightingRef.current);
      sunLightingRef.current = null;
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
      endAxisViewOrbitLock(controls);
      disposeModelBoundingBoxEdges(boundingBoxEdgesRef.current);
      boundingBoxEdgesRef.current = null;
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

      const sunStudyActive = environmentalAnalysisRef.current?.sunStudy?.enabled === true;
      if (sunStudyActive) {
        setLightGroupVisible(legacyLightsRef.current, false);
        scene.environment = null;
        if ('environmentIntensity' in scene) {
          scene.environmentIntensity = 1;
        }
        setHdriToneMapping(renderer, false);
        return;
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
  }, [loadState, showEnvironment, lightingMode, environmentPreset, renderStyle, viewportBackgroundColor, environmentalAnalysis]);

  useEffect(() => {
    const adapter = sunLightingRef.current;
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!adapter || !scene || !renderer || loadState !== 'ready') return;

    if (renderStyle === 'clay') {
      applyBimSunLighting(adapter, {
        environmentalAnalysis: { sunStudy: { enabled: false } },
        bounds: modelBoundsRef.current,
        modelRoot: null,
      });
      if (environmentalAnalysis?.sunStudy?.enabled === true) {
        const sun = resolveSunFromEnvironmentalState(environmentalAnalysis);
        updateClaySunDirection(clayLightingStateRef.current, resolveSunDirection(sun));
      }
      applyViewportBackground(scene, renderer, viewportBackgroundRef.current);
      return;
    }

    const enabled = environmentalAnalysis?.sunStudy?.enabled === true;
    if (enabled) {
      disposeEnvironmentRef.current();
      disposeEnvironmentRef.current = () => {};
      if (directLightsRef.current) {
        removeLightGroup(scene, directLightsRef.current);
        directLightsRef.current = null;
      }
      setLightGroupVisible(legacyLightsRef.current, false);
      setHdriToneMapping(renderer, false);
    }

    applyBimSunLighting(adapter, {
      environmentalAnalysis,
      bounds: modelBoundsRef.current,
      modelRoot: modelRef.current?.object ?? null,
    });
    applyViewportBackground(scene, renderer, viewportBackgroundRef.current);
  }, [environmentalAnalysis, loadState, renderStyle, viewportBounds]);

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
    if (environmentalAnalysisRef.current?.sunStudy?.enabled === true) {
      const sun = resolveSunFromEnvironmentalState(environmentalAnalysisRef.current);
      updateClaySunDirection(clayLightingStateRef.current, resolveSunDirection(sun));
    }
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
    const placementActive = measureModeActive && !measureEditMode;
    if (placementActive) {
      controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
      controller?.setActive(true);
    } else {
      controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE };
      controller?.setActive(false);
      if (!placementActive) setMeasureDraftActive(false);
    }
    syncOrbitControlsAfterCameraFit(controls);
  }, [measureModeActive, measureEditMode]);

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
      const effectiveColorByProperty = effectiveDisplayMode === 'colorBy'
        ? (colorByProperty ?? BIM_COLOR_BY_DEFAULT_PROPERTY)
        : null;
      const colorByElements = resultElements.length > 0
        ? resultElements
        : (preparedModel?.elements ?? []);

      if (targetElements.length === 0) {
        if (effectiveDisplayMode === 'ghostOthers') {
          const allLocalIds = localIdsRef.current.length > 0 ? localIdsRef.current : await model.getLocalIds();
          for (const chunk of chunkLocalIds(allLocalIds)) {
            if (!shouldApplySelectionRun(runSeq, applySelectionSeqRef.current)) return;
            await model.highlight(chunk, ghostMaterial);
          }
        } else if (effectiveDisplayMode === 'colorBy') {
          await applyColorByHighlight(model, preparedModel, cache, {
            elements: colorByElements,
            property: effectiveColorByProperty,
            shouldCancel: () => !shouldApplySelectionRun(runSeq, applySelectionSeqRef.current),
          });
          if (selectedElement) {
            const selectedIdMap = await resolveFragmentsLocalIdsByGlobalIds(
              model,
              [selectedElement.ifcGlobalId],
              cache,
            );
            const primaryLocalId = selectedIdMap.get(selectedElement.ifcGlobalId);
            if (isValidFragmentsLocalId(primaryLocalId)) {
              await model.highlight([primaryLocalId], selectedMaterial);
            }
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
      if (localIds.length === 0 && effectiveDisplayMode !== 'colorBy') return;

      const primaryLocalId = selectedElement
        ? idMap.get(selectedElement.ifcGlobalId)
        : localIds[0];

      if (effectiveDisplayMode === 'colorBy') {
        await applyColorByHighlight(model, preparedModel, cache, {
          elements: colorByElements,
          property: effectiveColorByProperty,
          shouldCancel: () => !shouldApplySelectionRun(runSeq, applySelectionSeqRef.current),
        });
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
    if (!canvas || !measureHudOpen || measureEditModeRef.current) return undefined;

    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      const pick = pickRlMarkerAtPointer(event.clientX, event.clientY);
      if (!pick) return;
      event.preventDefault();
      event.stopPropagation();
      handleRlMarkerSelect(pick);
    };

    const onContextMenu = (event) => {
      const pick = pickRlMarkerAtPointer(event.clientX, event.clientY);
      if (!pick) return;
      event.preventDefault();
      event.stopPropagation();
      handleRlMarkerDelete(pick);
    };

    canvas.addEventListener('pointerdown', onPointerDown, true);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown, true);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [measureHudOpen, measureEditMode, pickRlMarkerAtPointer, handleRlMarkerSelect, handleRlMarkerDelete]);

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

  const applyProjectionMode = useCallback((nextMode) => {
    if (loadState !== 'ready') return;
    const currentMode = projectionModeRef.current;
    if (nextMode === currentMode) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const model = modelRef.current;
    const container = containerRef.current;
    if (!camera || !controls || !container) return;
    const rect = container.getBoundingClientRect();
    const newCamera = swapBimCamera(camera, controls, model, nextMode, {
      width: rect.width,
      height: rect.height,
    });
    cameraRef.current = newCamera;
    projectionModeRef.current = nextMode;
    onProjectionModeChangeRef.current(nextMode);
    void updateFragmentsRef.current?.(true, { retryModelRegistration: true });
  }, [loadState]);

  useEffect(() => {
    if (!viewApplyRequest?.token || viewApplyTokenRef.current === viewApplyRequest.token) return;
    if (loadState !== 'ready') return;
    viewApplyTokenRef.current = viewApplyRequest.token;
    const controls = controlsRef.current;
    const container = containerRef.current;
    if (!controls || !container || !viewApplyRequest.camera) return;

    const targetProjection = viewApplyRequest.projectionMode ?? projectionModeRef.current;
    const currentProjection = cameraRef.current?.isOrthographicCamera ? 'orthographic' : 'perspective';
    if (targetProjection !== currentProjection) {
      applyProjectionMode(targetProjection);
    }

    const rect = container.getBoundingClientRect();
    restoreBimCameraState(cameraRef.current, controls, viewApplyRequest.camera, {
      width: rect.width,
      height: rect.height,
    });

    if (cameraRef.current?.isPerspectiveCamera) {
      setFovInput(String(Math.round(cameraRef.current.fov)));
    }

    emitCameraChange();
    void refreshSectionCutRef.current?.({ updateFragments: true });
    void updateFragmentsRef.current?.(true, { retryModelRegistration: true });
    if (viewApplyRequest.wireframeMode) {
      window.requestAnimationFrame(() => {
        void rebuildWireframeEdges();
      });
    }
  }, [applyProjectionMode, emitCameraChange, loadState, rebuildWireframeEdges, viewApplyRequest]);

  useEffect(() => {
    if (!viewportCaptureRef) return undefined;
    viewportCaptureRef.current = {
      captureWorkspaceSnapshot: () => {
        if (loadState !== 'ready') return null;
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return null;
        const serialized = serializeBimCameraState(camera, controls, projectionModeRef.current);
        if (!serialized) return null;
        return {
          camera: serialized,
          projectionMode: projectionModeRef.current,
        };
      },
      captureThumbnail: async () => {
        if (loadState !== 'ready') return null;
        const renderer = rendererRef.current;
        if (!renderer) return null;
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        void updateFragmentsRef.current?.(true, { retryModelRegistration: false });
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        try {
          return await captureBimViewportThumbnail(renderer);
        } catch {
          return null;
        }
      },
    };
    return () => {
      if (viewportCaptureRef.current) viewportCaptureRef.current = null;
    };
  }, [loadState, viewportCaptureRef]);

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

  const handleMeasureHudOpenChange = useCallback((next) => {
    const current = measureHudOpenRef.current;
    const resolved = typeof next === 'function' ? next(current) : next;
    if (!resolved) {
      closeMeasureHud();
      return;
    }
    if (measureKindRef.current === 'segment') {
      measureKindRef.current = 'rl';
      measureSnapModeRef.current = 'vertex';
      measurementControllerRef.current?.setMeasureKind('rl');
      measurementControllerRef.current?.setSnapMode('vertex');
      onMeasureKindChangeRef.current('rl');
      onMeasureSnapModeChangeRef.current('vertex');
    }
    setMeasureModeActive(true);
    setMeasureHudOpen(true);
  }, [closeMeasureHud]);

  const handleToggleLighting = useCallback(() => {
    onLightingChange(cycleBimLightingState({
      showEnvironment,
      environmentPreset,
      lightingMode,
    }));
  }, [environmentPreset, lightingMode, onLightingChange, showEnvironment]);

  const handleToggleBoundingBox = useCallback(() => {
    setBoundingBoxMode((enabled) => !enabled);
  }, []);

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

  const resolvedLayersHudMaxHeight = layersHudMaxHeight ?? normalizeLayersHudHeight(layersHudHeight);
  const resolvedLayersHudHeight = normalizeLayersHudHeight(layersHudHeight, resolvedLayersHudMaxHeight);

  const syncLayersHudMaxHeight = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    let carouselTopPx = null;
    if (viewCarouselOpen && viewCarouselPanelRef.current) {
      const carouselRect = viewCarouselPanelRef.current.getBoundingClientRect();
      carouselTopPx = carouselRect.top - containerRect.top;
    }
    setLayersHudMaxHeight(resolveBimLayersHudMaxHeightPx({
      viewportHeight: containerRect.height,
      carouselTopPx,
      hudTopPx: readBimViewportHudTopPx(container),
    }));
  }, [viewCarouselOpen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const observer = new ResizeObserver(syncLayersHudMaxHeight);
    observer.observe(container);

    let carouselFrame = 0;
    const observeCarousel = () => {
      const carousel = viewCarouselPanelRef.current;
      if (carousel) observer.observe(carousel);
      syncLayersHudMaxHeight();
    };

    observeCarousel();
    if (viewCarouselOpen) {
      carouselFrame = window.requestAnimationFrame(observeCarousel);
    }

    window.addEventListener('resize', syncLayersHudMaxHeight);
    return () => {
      window.cancelAnimationFrame(carouselFrame);
      observer.disconnect();
      window.removeEventListener('resize', syncLayersHudMaxHeight);
    };
  }, [syncLayersHudMaxHeight, viewCarouselOpen]);

  useEffect(() => {
    if (layersHudMaxHeight == null) return;
    const clamped = normalizeLayersHudHeight(layersHudHeight, layersHudMaxHeight);
    if (clamped !== layersHudHeight) {
      onLayersHudHeightChange(clamped);
    }
  }, [layersHudHeight, layersHudMaxHeight, onLayersHudHeightChange]);

  useEffect(() => {
    const onPointerMove = (event) => {
      const state = layersHudResizeRef.current;
      if (!state || layersHudMaxHeight == null) return;
      const delta = event.clientY - state.startY;
      onLayersHudHeightChange(normalizeLayersHudHeight(
        state.startHeight + delta,
        layersHudMaxHeight,
      ));
    };
    const onPointerUp = () => {
      layersHudResizeRef.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [layersHudMaxHeight, onLayersHudHeightChange]);

  const handleLayersHudResizePointerDown = useCallback((event) => {
    event.preventDefault();
    layersHudResizeRef.current = {
      startY: event.clientY,
      startHeight: resolvedLayersHudHeight,
    };
  }, [resolvedLayersHudHeight]);

  const handleToggleSectionHud = useCallback(() => {
    setSectionHudOpen((open) => !open);
  }, []);

  const handleToggleSunStudyHud = useCallback(() => {
    setSunStudyHudOpen((open) => !open);
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

  const handleToggleColorByIfcClass = useCallback(() => {
    if (displayMode === 'colorBy') {
      onDisplayModeChange('highlight');
      onColorByPropertyChange(null);
      return;
    }
    onDisplayModeChange('colorBy');
    onColorByPropertyChange(BIM_COLOR_BY_DEFAULT_PROPERTY);
  }, [displayMode, onColorByPropertyChange, onDisplayModeChange]);

  const handleToggleIsolateOnSelect = useCallback(() => {
    onIsolateOnSelectChange(!isolateOnSelect);
  }, [isolateOnSelect, onIsolateOnSelectChange]);

  const handleRemoveMeasurement = useCallback((measurementId) => {
    const nextMeasurements = measurementsRef.current.filter((entry) => entry.id !== measurementId);
    measurementsRef.current = nextMeasurements;
    onMeasurementsChangeRef.current(nextMeasurements);
    if (selectedRlPickRef.current?.id === measurementId) {
      selectedRlPickRef.current = null;
      setSelectedRlPick(null);
    }
    if (highlightedHudItemRef.current?.id === measurementId) {
      highlightedHudItemRef.current = null;
    }
    syncMeasurementOverlay();
  }, [syncMeasurementOverlay]);

  const handleHighlightedHudItemChange = useCallback((highlightItem) => {
    highlightedHudItemRef.current = highlightItem;
    syncMeasurementOverlay();
  }, [syncMeasurementOverlay]);

  const handleDeleteAllMeasurements = useCallback(() => {
    measurementsRef.current = [];
    onMeasurementsChangeRef.current([]);
    rlDatumRef.current = null;
    onDeleteRlDatumRef.current();
    selectedRlPickRef.current = null;
    setSelectedRlPick(null);
    highlightedHudItemRef.current = null;
    syncMeasurementOverlay();
  }, [syncMeasurementOverlay]);

  const handleRlDatumValueChange = useCallback((rlValue) => {
    const current = rlDatumRef.current;
    if (!current) return;
    const nextDatum = {
      ...current,
      rlValue: Number.isFinite(rlValue) ? rlValue : 0,
    };
    rlDatumRef.current = nextDatum;
    onRlDatumChangeRef.current(nextDatum);
    syncMeasurementOverlay();
  }, [syncMeasurementOverlay]);

  const handleDeleteRlDatum = useCallback(() => {
    rlDatumRef.current = null;
    onDeleteRlDatumRef.current();
    if (highlightedHudItemRef.current?.kind === 'datum') {
      highlightedHudItemRef.current = null;
    }
    syncMeasurementOverlay();
  }, [syncMeasurementOverlay]);

  const handleReplaceRlDatum = useCallback(() => {
    onMeasureKindChangeRef.current('datum');
  }, []);

  const handleRlMeasurementDatumToggle = useCallback((measurementId, measuredFromDatum) => {
    const nextMeasurements = measurementsRef.current.map((entry) => (
      entry.id === measurementId && entry.kind === 'rl'
        ? { ...entry, measuredFromDatum: Boolean(measuredFromDatum) }
        : entry
    ));
    measurementsRef.current = nextMeasurements;
    onMeasurementsChangeRef.current(nextMeasurements);
    syncMeasurementOverlay();
  }, [syncMeasurementOverlay]);

  const measureStatus = measureEditMode
    ? 'CLICK × ON LABELS TO DELETE'
    : (measureModeActive ? 'PRESS DELETE TO CANCEL' : null);

  const toolbarControls = (
    <div
      ref={toolbarControlsRef}
      className={BIM_VIEWPORT_TOOLBAR_SURFACE_CLASS}
      aria-label="Viewport controls"
    >
            {measureStatus ? (
              <>
                <div className="max-w-[12rem] shrink-0 truncate text-[10px] uppercase tracking-wider text-muted">
                  {measureStatus}
                </div>
                <BimViewportToolbarSeparator />
              </>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-y-1">
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
                modelUnits="m"
                measurements={measurements}
                rlDatum={rlDatum}
                enableRlOptions
                menuOpen={measureHudOpen}
                onMenuOpenChange={handleMeasureHudOpenChange}
                onToggleMeasureMode={handleToggleMeasureMode}
                onMeasureSnapModeChange={onMeasureSnapModeChange}
                onMeasureKindChange={onMeasureKindChange}
                onMeasureUnitsChange={onMeasureUnitsChange}
                onRemoveMeasurement={handleRemoveMeasurement}
                onDeleteRlDatum={handleDeleteRlDatum}
                onRlDatumValueChange={handleRlDatumValueChange}
                editMode={measureEditMode}
                onEditModeChange={setMeasureEditMode}
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
                title="Color by IFC type"
                onClick={handleToggleColorByIfcClass}
                className={`rounded border border-border p-1 ${displayMode === 'colorBy' ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
                aria-pressed={displayMode === 'colorBy'}
                aria-label="Color by IFC type"
              >
                <Palette size={14} strokeWidth={1.7} />
              </button>
              <button
                type="button"
                title="Bounding box overlay"
                onClick={handleToggleBoundingBox}
                className={`rounded border border-border p-1 ${boundingBoxMode ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
                aria-pressed={boundingBoxMode}
                aria-label="Bounding box overlay"
              >
                <BoxSelect size={14} strokeWidth={1.7} />
              </button>
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
                title={styleHudOpen ? 'Hide style settings' : 'Show style settings'}
                onClick={() => setStyleHudOpen((open) => !open)}
                className={`rounded border border-border p-1 ${styleHudOpen ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
                aria-pressed={styleHudOpen}
                aria-label={styleHudOpen ? 'Hide style settings panel' : 'Show style settings panel'}
              >
                <SlidersHorizontal size={14} strokeWidth={1.7} />
              </button>
              <BimStylePresetsMenu
                projectId={projectId}
                cardId={cardId}
                artifactId={artifactId}
                styleSettings={styleSettings}
                onApplyStyleSettings={onApplyStyleSettings}
              />
              <button
                type="button"
                title={viewCarouselOpen ? 'Hide view carousel' : 'Show view carousel'}
                onClick={onToggleViewCarousel}
                className={`rounded border border-border p-1 ${viewCarouselOpen ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
                aria-pressed={viewCarouselOpen}
                aria-label={viewCarouselOpen ? 'Hide view carousel' : 'Show view carousel'}
              >
                <Images size={14} strokeWidth={1.7} />
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
                title={fourDHudOpen ? 'Hide 4D sequencing' : 'Show 4D sequencing'}
                onClick={() => setFourDHudOpen((open) => !open)}
                className={`rounded border border-border p-1 ${fourDHudOpen ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
                aria-pressed={fourDHudOpen}
                aria-label={fourDHudOpen ? 'Hide 4D sequencing panel' : 'Show 4D sequencing panel'}
              >
                <CalendarDays size={14} strokeWidth={1.7} />
              </button>
              <button
                type="button"
                title={fiveDHudOpen ? 'Hide 5D takeoff' : 'Show 5D takeoff'}
                onClick={() => setFiveDHudOpen((open) => !open)}
                className={`rounded border border-border p-1 ${fiveDHudOpen ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-surface-muted'}`}
                aria-pressed={fiveDHudOpen}
                aria-label={fiveDHudOpen ? 'Hide 5D takeoff panel' : 'Show 5D takeoff panel'}
              >
                <DollarSign size={14} strokeWidth={1.7} />
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
              <button
                type="button"
                title={sunStudyHudOpen ? 'Hide sun study' : 'Sun study'}
                onClick={handleToggleSunStudyHud}
                className={`rounded border border-border p-1 ${
                  sunStudyHudOpen || environmentalAnalysis?.sunStudy?.enabled
                    ? 'bg-accent text-on-accent'
                    : 'text-secondary hover:bg-surface-muted'
                }`}
                aria-pressed={sunStudyHudOpen}
                aria-label={sunStudyHudOpen ? 'Hide sun study panel' : 'Show sun study panel'}
              >
                <SunMedium size={14} strokeWidth={1.7} />
              </button>
              </div>
            </div>
    </div>
  );

  useEffect(() => {
    const toolbarNode = toolbarControlsRef.current;
    const container = containerRef.current;
    if (!toolbarNode || !container) return undefined;

    const syncViewportChromeLayout = () => {
      const containerRect = container.getBoundingClientRect();
      const toolbarRect = toolbarNode.getBoundingClientRect();
      const toolbarBottomPx = Math.max(0, Math.round(toolbarRect.bottom - containerRect.top));
      let gimbalBottomPx = toolbarBottomPx;
      const gimbalNode = gimbalChromeRef.current;
      if (gimbalNode) {
        const gimbalRect = gimbalNode.getBoundingClientRect();
        gimbalBottomPx = Math.max(toolbarBottomPx, Math.round(gimbalRect.bottom - containerRect.top));
      }
      applyBimViewportToolbarLayout(container, toolbarBottomPx, gimbalBottomPx);
    };

    const syncToolbarLayout = () => {
      const nextHeight = Math.round(toolbarNode.getBoundingClientRect().height);
      if (nextHeight > 0) {
        setToolbarHeightPx(nextHeight);
      }
      syncViewportChromeLayout();
      syncLayersHudMaxHeight();
    };

    syncToolbarLayout();
    const observer = new ResizeObserver(syncToolbarLayout);
    observer.observe(toolbarNode);
    observer.observe(container);
    const gimbalNode = gimbalChromeRef.current;
    if (gimbalNode) observer.observe(gimbalNode);
    return () => observer.disconnect();
  }, [loadState, measureHudOpen, measureEditMode, projectionMode, wireframeMode, boundingBoxMode, displayMode, syncLayersHudMaxHeight]);

  const toolbarOverlay = (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-30 px-3">
      <div className="relative">
        <div className={`flex justify-center ${loadState === 'ready' ? BIM_VIEWPORT_GIMBAL_RESERVE_CLASS : ''}`}>
          {toolbarControls}
        </div>
        {loadState === 'ready' ? (
          <div
            ref={gimbalChromeRef}
            className="pointer-events-auto absolute right-0 top-0 shrink-0"
          >
            <BimViewNavigatorGimbal
              cubeSizePx={toolbarHeightPx}
              getCameraQuaternion={() => cameraQuaternionRef.current}
              getViewDirection={() => cameraViewDirectionRef.current}
              onApplyPreset={applyViewPreset}
            />
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-0 flex flex-col bg-preview-bg">
      <div
        ref={containerRef}
        tabIndex={0}
        className="flex-1 min-h-0 relative overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        {toolbarOverlay}
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
        {loadState === 'ready' && (layersHudOpen || sectionHudOpen || sunStudyHudOpen) && (
          <div
            data-bim-viewport-hud-stack="left"
            className="pointer-events-none absolute left-3 z-20 flex w-[min(calc(100%-1.5rem),19rem)] flex-col gap-2"
            style={{ top: 'var(--bim-viewport-hud-top, 0.75rem)' }}
          >
            {sunStudyHudOpen && (
              <BimSunStudyHud
                environmentalAnalysis={environmentalAnalysis}
                onEnvironmentalAnalysisChange={onEnvironmentalAnalysisChange}
              />
            )}
            {layersHudOpen && (
              <BimLayersHud
                catalog={layerCatalog}
                hiddenStoreys={hiddenStoreys}
                hiddenLayers={hiddenLayers}
                height={resolvedLayersHudHeight}
                maxHeight={resolvedLayersHudMaxHeight}
                storeysHeight={layersHudStoreysHeight}
                onStoreysHeightChange={onLayersHudStoreysHeightChange}
                onResizePointerDown={handleLayersHudResizePointerDown}
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
        {loadState === 'ready' && (agentHudOpen || bqlHudOpen || styleHudOpen || fourDHudOpen || fiveDHudOpen) && (
          <div
            data-bim-viewport-hud-stack="right"
            className="pointer-events-none absolute right-3 z-20 flex w-[min(calc(100%-1.5rem),30rem)] flex-col items-stretch gap-2 overflow-y-auto"
            style={{
              top: 'var(--bim-viewport-right-hud-top, var(--bim-viewport-hud-top, 0.75rem))',
              maxHeight: 'calc(100% - var(--bim-viewport-right-hud-top, var(--bim-viewport-hud-top, 0.75rem)) - 0.75rem)',
            }}
          >
            {agentHudOpen && (
              <BimAgentHud
                agentText={agentText}
                onAgentTextChange={onAgentTextChange}
                chatMessages={agentChatMessages}
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
            {fourDHudOpen && (
              <Bim4dHud
                sequences={bim4dSequences}
                activeSequenceId={active4dSequenceId}
                activeTaskId={active4dTaskId}
                savedResultSets={savedResultSets}
                selectedElementId={selectedElement?.id ?? null}
                queryElementIds={highlightElementIds}
                onCreateResultSet={onCreateResultSet}
                onCreateSequence={onCreate4dSequence}
                onCreateTask={onCreate4dTask}
                onSetActiveSequence={onSetActive4dSequence}
                onSetActiveTask={onSetActive4dTask}
                onStepTask={onStep4dTask}
              />
            )}
            {fiveDHudOpen && (
              <Bim5dHud
                preparedModel={preparedModel}
                costPlans={bim5dCostPlans}
                activeCostPlanId={active5dCostPlanId}
                savedResultSets={savedResultSets}
                onCreateCostPlan={onCreate5dCostPlan}
                onSetActiveCostPlan={onSetActive5dCostPlan}
                onPatchCostPlan={onPatch5dCostPlan}
                onAddRateRow={onAdd5dRateRow}
                onSelectTakeoffRow={onSelect5dTakeoffRow}
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
                onResetClayDefaults={onResetClayDefaults}
                wireframeLineWeight={wireframeLineWeight}
                wireframeOpacity={wireframeOpacity}
                wireframeColor={wireframeColor}
                wireframeHiddenLines={wireframeHiddenLines}
                onWireframeStyleChange={onWireframeStyleChange}
              />
            )}
          </div>
        )}
        {loadState === 'ready' && (measurements.length > 0 || rlDatum) && (
          <MeasurementsListPanel
            measurements={measurements}
            units={measureUnits}
            modelUnits="m"
            measurementsVisible={measurementsVisible}
            rlDatum={rlDatum}
            onMeasurementsVisibleChange={onMeasurementsVisibleChange}
            onRemoveMeasurement={handleRemoveMeasurement}
            onDeleteAllMeasurements={handleDeleteAllMeasurements}
            onHighlightedHudItemChange={handleHighlightedHudItemChange}
            onRlDatumValueChange={handleRlDatumValueChange}
            onDeleteRlDatum={handleDeleteRlDatum}
            onReplaceRlDatum={handleReplaceRlDatum}
            onRlMeasurementDatumToggle={handleRlMeasurementDatumToggle}
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
        {loadState === 'ready' && (
          <BimViewCarousel
            open={viewCarouselOpen}
            panelRef={viewCarouselPanelRef}
            viewSets={viewSets}
            activeViewSetId={activeViewSetId}
            activeViewId={activeViewId}
            busy={viewSetsBusy}
            status={viewSetsStatus}
            error={viewSetsError}
            loadViewThumbnail={loadViewThumbnail}
            onSelectViewSet={onSelectViewSet}
            onCreateViewSet={onCreateViewSet}
            onRenameViewSet={onRenameViewSet}
            onDeleteViewSet={onDeleteViewSet}
            onSaveCurrentView={onSaveCurrentView}
            onApplyView={onApplyView}
            onRenameView={onRenameView}
            onUpdateView={onUpdateView}
            onDeleteView={onDeleteView}
          />
        )}
      </div>
    </div>
  );
}

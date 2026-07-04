import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Eye, EyeOff, LocateFixed, PanelLeft, PanelLeftClose, PanelRight, PanelRightClose, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FragmentsModels, RenderedFaces } from '@thatopen/fragments';
import fragmentsWorkerUrl from '@thatopen/fragments/dist/Worker/worker.mjs?url';
import {
  fitPerspectiveCameraToDefaultView,
  syncOrbitControlsAfterCameraFit,
} from '../../threeDArtifact/utils/cameraFit.js';
import {
  isValidFragmentsLocalId,
  resolveFragmentsGlobalIdByLocalId,
  resolveFragmentsLocalIdByGlobalId,
} from '../bim-core/fragmentsSelection.js';
import { BimSelectedElementHud } from './BimSelectedElementHud.jsx';

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

function serializeCameraState(camera, controls) {
  if (!camera || !controls?.target) return null;
  return {
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    up: camera.up.toArray(),
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
  };
}

function fitPerspectiveCameraToBox(camera, controls, box, renderer) {
  if (!camera?.isPerspectiveCamera || !controls || !box || box.isEmpty()) return false;
  const helper = new THREE.Object3D();
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const geometry = new THREE.BoxGeometry(size.x || 0.001, size.y || 0.001, size.z || 0.001);
  const mesh = new THREE.Mesh(geometry);
  mesh.position.copy(center);
  helper.add(mesh);
  const rendererSize = renderer?.getSize(new THREE.Vector2());
  const viewportAspect = rendererSize?.y ? rendererSize.x / rendererSize.y : camera.aspect;
  const fitted = fitPerspectiveCameraToDefaultView(camera, controls, helper, {
    margin: 1.6,
    viewportAspect,
  });
  geometry.dispose();
  return fitted;
}

export function BimViewport({
  preparedModel,
  selectedElement,
  selectedProperties = [],
  highlightElementIds = [],
  displayMode,
  focusSelectionToken = 0,
  leftPanelOpen = true,
  rightPanelOpen = true,
  onToggleLeftPanel = () => {},
  onToggleRightPanel = () => {},
  onDisplayModeChange,
  onSelectElementByGlobalId = () => {},
  onCameraChange = () => {},
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
  const animationRef = useRef(null);
  const localIdsRef = useRef([]);
  const lastFocusTokenRef = useRef(focusSelectionToken);
  const onCameraChangeRef = useRef(onCameraChange);
  const pointerDownRef = useRef(null);
  const [loadState, setLoadState] = useState(() => (getViewportError(preparedModel) ? 'error' : 'loading'));
  const [renderError, setRenderError] = useState(() => getViewportError(preparedModel));

  useEffect(() => {
    onCameraChangeRef.current = onCameraChange;
  }, [onCameraChange]);

  const fitModel = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const model = modelRef.current;
    const renderer = rendererRef.current;
    if (!camera || !controls || !model?.object) return;
    const size = renderer?.getSize(new THREE.Vector2());
    const aspect = size?.y ? size.x / size.y : camera.aspect;
    fitPerspectiveCameraToDefaultView(camera, controls, model.object, {
      margin: 1.35,
      viewportAspect: aspect,
    });
    const state = serializeCameraState(camera, controls);
    if (state) onCameraChangeRef.current(state);
  }, []);

  const resetVisibility = useCallback(() => {
    const model = modelRef.current;
    if (!model) return;
    void model.resetVisible().then(() => model.resetHighlight());
  }, []);

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
    setLoadState('loading');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#171412');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
    camera.position.set(12, 9, 12);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;
    const emitCameraChange = () => {
      const state = serializeCameraState(camera, controls);
      if (state) onCameraChangeRef.current(state);
    };
    controls.addEventListener('end', emitCameraChange);

    scene.add(new THREE.HemisphereLight('#ffffff', '#4b423a', 2.2));
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.4);
    keyLight.position.set(10, 16, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight('#d8c7b4', 1);
    fillLight.position.set(-12, 8, -10);
    scene.add(fillLight);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      syncOrbitControlsAfterCameraFit(controls);
    };
    const resizeAndRefresh = () => {
      resize();
      void fragmentsRef.current?.update?.(true);
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
        const model = await fragments.load(buffer, {
          modelId: preparedModel.metadata?.fingerprint ?? `bim-${Date.now()}`,
          camera,
        });
        if (disposed) {
          await model.dispose();
          return;
        }
        modelRef.current = model;
        model.useCamera(camera);
        scene.add(model.object);
        localIdsRef.current = await model.getLocalIds();
        if (!disposed) {
          resize();
          await fragments.update(true);
          fitModel();
          renderer.render(scene, camera);
          emitCameraChange();
          setLoadState('ready');
          window.requestAnimationFrame(() => {
            if (disposed) return;
            resize();
            fitModel();
            void fragments.update(true);
          });
          window.setTimeout(() => {
            if (disposed) return;
            resize();
            fitModel();
            void fragments.update(true);
          }, 80);
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
      if (!updatePending) {
        updatePending = true;
        void fragments.update().finally(() => {
          updatePending = false;
        });
      }
      renderer.render(scene, camera);
      animationRef.current = window.requestAnimationFrame(animate);
    };

    void loadFragments();
    animate();

    return () => {
      disposed = true;
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeAndRefresh);
      controls.removeEventListener('end', emitCameraChange);
      controls.dispose();
      void fragments.dispose();
      renderer.dispose();
      scene.clear();
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
      fragmentsRef.current = null;
      modelRef.current = null;
      localIdsRef.current = [];
    };
  }, [fitModel, preparedModel]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || loadState !== 'ready') return;
    let cancelled = false;

    async function applySelection() {
      await model.resetHighlight();
      await model.resetVisible();
      const resultElements = (preparedModel?.elements ?? []).filter((element) => highlightElementIds.includes(element.id));
      const selectedOnly = selectedElement ? [selectedElement] : [];
      const targetElements = resultElements.length > 0 ? resultElements : selectedOnly;
      if (targetElements.length === 0 || cancelled) return;

      const localIds = (await Promise.all(
        targetElements.map((element) => resolveFragmentsLocalIdByGlobalId(model, element.ifcGlobalId)),
      )).filter(isValidFragmentsLocalId);
      if (localIds.length === 0 || cancelled) return;
      const primaryLocalId = selectedElement
        ? await resolveFragmentsLocalIdByGlobalId(model, selectedElement.ifcGlobalId)
        : localIds[0];

      if (displayMode === 'isolate') {
        await model.setVisible(undefined, false);
        await model.setVisible(localIds, true);
      } else if (displayMode === 'ghostOthers') {
        const allLocalIds = localIdsRef.current.length > 0 ? localIdsRef.current : await model.getLocalIds();
        const selectedSet = new Set(localIds);
        const otherLocalIds = allLocalIds.filter((candidate) => !selectedSet.has(candidate));
        if (otherLocalIds.length > 0) await model.highlight(otherLocalIds, GHOST_MATERIAL);
      }
      await model.highlight(localIds, SELECTED_MATERIAL);

      if (focusSelectionToken !== lastFocusTokenRef.current && isValidFragmentsLocalId(primaryLocalId)) {
        lastFocusTokenRef.current = focusSelectionToken;
        const box = typeof model.getMergedBox === 'function' ? await model.getMergedBox([primaryLocalId]) : null;
        fitPerspectiveCameraToBox(cameraRef.current, controlsRef.current, box, rendererRef.current);
        const state = serializeCameraState(cameraRef.current, controlsRef.current);
        if (state) onCameraChangeRef.current(state);
      }
    }

    void applySelection().catch((error) => {
      if (!cancelled) setRenderError(error?.message || 'Could not apply BIM selection.');
    });
    return () => {
      cancelled = true;
    };
  }, [displayMode, focusSelectionToken, highlightElementIds, loadState, preparedModel?.elements, selectedElement]);

  const handleCanvasPointerDown = useCallback((event) => {
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const pickFromPointerEvent = useCallback((event) => {
    const pointerDown = pointerDownRef.current;
    pointerDownRef.current = null;
    if (
      pointerDown
      && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5
    ) {
      return;
    }
    const model = modelRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!model || !camera || !renderer) return;
    const mouse = new THREE.Vector2(event.clientX, event.clientY);
    void Promise.resolve(fragmentsRef.current?.update?.(true)).then(() => model.raycast({ camera, mouse, dom: renderer.domElement })).then(async (hit) => {
      if (!hit || !isValidFragmentsLocalId(hit.localId)) return;
      const guid = await resolveFragmentsGlobalIdByLocalId(model, hit.localId);
      if (guid) onSelectElementByGlobalId(guid);
    }).catch((error) => {
      setRenderError(error?.message || 'Could not pick BIM geometry.');
    });
  }, [onSelectElementByGlobalId]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-preview-bg">
      <div className="shrink-0 flex items-center justify-between border-b border-border bg-surface px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-muted">
          IFC Fragments View - {total} elements
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
      <div ref={containerRef} className="flex-1 min-h-0 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          onPointerDown={handleCanvasPointerDown}
          onPointerUp={pickFromPointerEvent}
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
        {loadState === 'ready' && selectedElement && (
          <BimSelectedElementHud
            element={selectedElement}
            properties={selectedProperties}
            inspectorOpen={rightPanelOpen}
          />
        )}
      </div>
    </div>
  );
}

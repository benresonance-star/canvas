import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  ARCHITECTURE_NODES,
  ARCHITECTURE_PIPES,
  buildConcentratedActionLayout,
  computeLayout3dBounds,
  easeOutCubic,
  interpolateDiagnosticsLayout3d,
  isOverviewAction,
  applyConcentrateNodeOverrides,
} from '../../../lib/architecture/index.js';
import {
  computeDiagnosticsSceneBounds,
  fitDiagnosticsCameraToExtent,
  lerpDiagnosticsCameraToExtent,
} from './diagnosticsWebGLCamera.js';
import { DiagnosticsConcentrateContext } from './DiagnosticsConcentrateContext.jsx';

const TRANSITION_SEC = 0.65;
const HIDE_UNRELATED_THRESHOLD = 0.04;

/**
 * @param {object} props
 * @param {boolean} props.animate Run concentrate enter/exit transitions.
 * @param {boolean} props.concentrateEnabled
 * @param {import('../../../lib/architecture/architectureGraphSchema.js').ArchitectureActionDef | null} props.action
 * @param {ReturnType<typeof import('../../../lib/architecture/diagnosticsLayout3d.js').buildDiagnosticsLayout3d>} props.baseLayout3d
 * @param {Record<string, { centerX: number, centerY: number }>} [props.savedNodeOverrides]
 * @param {() => void} [props.onConcentrateSettled]
 * @param {React.ReactNode} props.children
 */
export function DiagnosticsConcentrateBridge({
  animate,
  concentrateEnabled,
  action,
  baseLayout3d,
  savedNodeOverrides = null,
  onConcentrateSettled,
  children,
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const progressRef = useRef(0);
  const transitionTargetRef = useRef(0);
  const transitionActiveRef = useRef(false);
  const hideScopeSyncedRef = useRef(false);
  const actionIdRef = useRef(action?.id ?? null);
  const [layoutTick, setLayoutTick] = useState(0);

  const layoutRuntimeRef = useRef({
    animating: false,
    progress: 0,
    layout3d: null,
  });

  const concentrateLayout3d = useMemo(() => {
    if (!action || isOverviewAction(action)) return null;
    const auto = buildConcentratedActionLayout({
      action,
      graphNodes: ARCHITECTURE_NODES,
      pipes: ARCHITECTURE_PIPES,
    });
    if (!savedNodeOverrides || Object.keys(savedNodeOverrides).length === 0) {
      return auto;
    }
    return applyConcentrateNodeOverrides(auto, savedNodeOverrides);
  }, [action, savedNodeOverrides]);

  const fullBounds = useMemo(
    () => computeDiagnosticsSceneBounds(baseLayout3d),
    [baseLayout3d],
  );

  const concentrateActive = Boolean(
    concentrateEnabled
    && concentrateLayout3d
    && concentrateLayout3d.visibleNodeIds.size > 0,
  );

  const cameraRef = useRef(camera);
  const controlsRef = useRef(controls);
  const fullBoundsRef = useRef(fullBounds);
  const clusterBoundsRef = useRef(fullBounds);
  const baseLayout3dRef = useRef(baseLayout3d);
  const concentrateLayout3dRef = useRef(concentrateLayout3d);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    fullBoundsRef.current = fullBounds;
  }, [fullBounds]);

  useEffect(() => {
    baseLayout3dRef.current = baseLayout3d;
  }, [baseLayout3d]);

  useEffect(() => {
    concentrateLayout3dRef.current = concentrateLayout3d;
    clusterBoundsRef.current = concentrateLayout3d
      ? computeLayout3dBounds(concentrateLayout3d, concentrateLayout3d.visibleNodeIds)
      : fullBounds;
  }, [concentrateLayout3d, fullBounds]);

  const interpolateLayout = (rawProgress) => {
    const concentrate = concentrateLayout3dRef.current;
    if (!concentrate) return baseLayout3dRef.current;
    return interpolateDiagnosticsLayout3d(
      baseLayout3dRef.current,
      concentrate,
      rawProgress,
      concentrate.visibleNodeIds,
    );
  };

  const publishRuntime = (rawProgress, animating) => {
    const eased = easeOutCubic(rawProgress);
    layoutRuntimeRef.current = {
      animating,
      progress: eased,
      layout3d: interpolateLayout(eased),
    };
  };

  const syncReactLayout = () => {
    setLayoutTick((tick) => tick + 1);
  };

  useEffect(() => {
    if (action?.id === actionIdRef.current) return;
    actionIdRef.current = action?.id ?? null;
    progressRef.current = 0;
    transitionTargetRef.current = 0;
    transitionActiveRef.current = false;
    hideScopeSyncedRef.current = false;
    publishRuntime(0, false);
    syncReactLayout();
  }, [action?.id]);

  useEffect(() => {
    if (!animate) return;
    transitionTargetRef.current = concentrateActive ? 1 : 0;
    transitionActiveRef.current = true;
    hideScopeSyncedRef.current = progressRef.current > HIDE_UNRELATED_THRESHOLD;
  }, [animate, concentrateActive]);

  useEffect(() => () => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const bounds = fullBoundsRef.current;
    if (cam && ctrl) {
      fitDiagnosticsCameraToExtent(cam, ctrl, bounds);
    }
  }, []);

  useFrame((_, delta) => {
    if (!transitionActiveRef.current || !camera || !controls) {
      publishRuntime(progressRef.current, false);
      return;
    }

    const target = transitionTargetRef.current;
    const previous = progressRef.current;
    const distance = target - previous;

    if (Math.abs(distance) <= 0.0001) {
      transitionActiveRef.current = false;
      progressRef.current = target;
      publishRuntime(target, false);
      syncReactLayout();

      const settledBounds = target > 0.5
        ? clusterBoundsRef.current
        : fullBoundsRef.current;
      fitDiagnosticsCameraToExtent(camera, controls, settledBounds);

      if (target === 0) {
        onConcentrateSettled?.();
      }
      return;
    }

    const step = Math.min(1, delta / TRANSITION_SEC);
    progressRef.current = previous + distance * step;
    publishRuntime(progressRef.current, true);

    const crossedHideThreshold = (
      (previous <= HIDE_UNRELATED_THRESHOLD && progressRef.current > HIDE_UNRELATED_THRESHOLD)
      || (previous > HIDE_UNRELATED_THRESHOLD && progressRef.current <= HIDE_UNRELATED_THRESHOLD)
    );
    if (crossedHideThreshold && hideScopeSyncedRef.current !== (progressRef.current > HIDE_UNRELATED_THRESHOLD)) {
      hideScopeSyncedRef.current = progressRef.current > HIDE_UNRELATED_THRESHOLD;
      syncReactLayout();
    }

    const eased = easeOutCubic(progressRef.current);
    lerpDiagnosticsCameraToExtent(
      camera,
      controls,
      fullBoundsRef.current,
      clusterBoundsRef.current,
      eased,
    );
  });

  const layoutProgress = easeOutCubic(progressRef.current);
  const layout3d = interpolateLayout(layoutProgress);

  const sceneBounds = concentrateLayout3d && layoutProgress > 0
    ? computeLayout3dBounds(layout3d, concentrateLayout3d.visibleNodeIds)
    : fullBounds;

  const contextValue = useMemo(() => ({
    layout3d,
    progress: layoutProgress,
    concentrateActive: concentrateActive && layoutProgress > 0.001,
    visibleNodeIds: concentrateLayout3d?.visibleNodeIds ?? new Set(),
    visibleEdgeIds: concentrateLayout3d?.visibleEdgeIds ?? new Set(),
    sceneBounds,
    layoutRuntimeRef,
  }), [
    layout3d,
    layoutProgress,
    concentrateActive,
    concentrateLayout3d,
    sceneBounds,
    layoutTick,
  ]);

  return (
    <DiagnosticsConcentrateContext.Provider value={contextValue}>
      {children}
    </DiagnosticsConcentrateContext.Provider>
  );
}

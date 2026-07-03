import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import {
  fitDiagnosticsCameraToExtent,
  getDiagnosticsOrbitDistanceLimits,
  stepDiagnosticsCameraZoom,
} from './diagnosticsWebGLCamera.js';

/**
 * Registers zoom/fit handlers on a parent ref once OrbitControls is active.
 *
 * @param {object} props
 * @param {{ center: import('three').Vector3, radius: number }} props.bounds
 * @param {boolean} [props.active]
 * @param {React.MutableRefObject<{
 *   zoomIn?: () => void,
 *   zoomOut?: () => void,
 *   fitView?: () => void,
 * } | null>} props.actionsRef
 */
export function DiagnosticsWebGLZoomActionsBridge({ bounds, actionsRef, active = true }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const hasFramedCameraRef = useRef(false);
  const wasActiveRef = useRef(active);
  const limits = useMemo(
    () => getDiagnosticsOrbitDistanceLimits(bounds.radius),
    [bounds.radius],
  );

  useEffect(() => {
    if (active && !wasActiveRef.current) {
      hasFramedCameraRef.current = false;
    }
    wasActiveRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!camera || !controls) {
      actionsRef.current = null;
      return undefined;
    }

    actionsRef.current = {
      zoomIn: () => stepDiagnosticsCameraZoom(camera, controls, 'in', limits),
      zoomOut: () => stepDiagnosticsCameraZoom(camera, controls, 'out', limits),
      fitView: () => fitDiagnosticsCameraToExtent(camera, controls, bounds),
    };

    if (active && !hasFramedCameraRef.current) {
      hasFramedCameraRef.current = true;
      fitDiagnosticsCameraToExtent(camera, controls, bounds);
    }

    return () => {
      actionsRef.current = null;
    };
  }, [actionsRef, active, bounds, camera, controls, limits]);

  return null;
}

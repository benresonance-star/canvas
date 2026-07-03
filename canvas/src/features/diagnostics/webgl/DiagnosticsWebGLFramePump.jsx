import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

const WAKE_FRAMES = 3;

/**
 * Resume rendering when the 3D layer becomes visible again.
 *
 * @param {object} props
 * @param {boolean} props.active
 */
export function DiagnosticsWebGLFramePump({ active }) {
  const { gl, camera, invalidate, size } = useThree();
  const wakeFramesRef = useRef(0);

  useEffect(() => {
    if (!active) {
      wakeFramesRef.current = 0;
      return;
    }

    const parent = gl.domElement.parentElement;
    const width = parent?.clientWidth ?? size.width;
    const height = parent?.clientHeight ?? size.height;
    if (width > 0 && height > 0) {
      gl.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    wakeFramesRef.current = WAKE_FRAMES;
    invalidate();
  }, [active, camera, gl, invalidate, size.height, size.width]);

  useFrame(() => {
    if (!active || wakeFramesRef.current <= 0) return;
    wakeFramesRef.current -= 1;
    invalidate();
  });

  return null;
}

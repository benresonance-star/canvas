import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { resolveViewNavigatorLabel } from '../bim-core/bimViewNavigator.js';

export const VIEW_NAVIGATOR_PRESETS = [
  { id: 'home', label: 'Home' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
];

const GIMBAL_CUBE_SIZE_PX = 32;
const FALLBACK_GIMBAL_EDGE_COLOR = 0x57534e;

function resolveGimbalEdgeColor() {
  if (typeof document === 'undefined') return FALLBACK_GIMBAL_EDGE_COLOR;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-secondary').trim();
  if (!raw) return FALLBACK_GIMBAL_EDGE_COLOR;
  try {
    return new THREE.Color(raw).getHex();
  } catch {
    return FALLBACK_GIMBAL_EDGE_COLOR;
  }
}

function createWireframeViewCube() {
  const geometry = new THREE.BoxGeometry(0.92, 0.92, 0.92);
  const edgesGeometry = new THREE.EdgesGeometry(geometry);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: resolveGimbalEdgeColor(),
    transparent: true,
    opacity: 0.95,
  });
  const edges = new THREE.LineSegments(edgesGeometry, edgeMaterial);
  return { edges, geometry, edgesGeometry, edgeMaterial };
}

export function BimViewNavigatorGimbal({
  getCameraQuaternion,
  getViewDirection,
  onApplyPreset,
  cubeSizePx = GIMBAL_CUBE_SIZE_PX,
  className = '',
}) {
  const canvasRef = useRef(null);
  const labelRef = useRef(null);
  const getCameraQuaternionRef = useRef(getCameraQuaternion);
  const getViewDirectionRef = useRef(getViewDirection);
  const onApplyPresetRef = useRef(onApplyPreset);
  const [menu, setMenu] = useState(null);
  const cubeSize = Math.max(24, Math.round(cubeSizePx));

  getCameraQuaternionRef.current = getCameraQuaternion;
  getViewDirectionRef.current = getViewDirection;
  onApplyPresetRef.current = onApplyPreset;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(cubeSize, cubeSize, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.1, 10);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);

    const {
      edges,
      geometry,
      edgesGeometry,
      edgeMaterial,
    } = createWireframeViewCube();
    scene.add(edges);

    let frameId = 0;
    const renderFrame = () => {
      const quaternion = getCameraQuaternionRef.current?.();
      if (quaternion) {
        edges.quaternion.copy(quaternion).invert();
      }

      const viewDirection = getViewDirectionRef.current?.();
      if (labelRef.current && viewDirection) {
        labelRef.current.textContent = resolveViewNavigatorLabel(viewDirection);
      }

      edgeMaterial.color.setHex(resolveGimbalEdgeColor());
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(renderFrame);
    };
    frameId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(frameId);
      geometry.dispose();
      edgesGeometry.dispose();
      edgeMaterial.dispose();
      renderer.dispose();
    };
  }, [cubeSize]);

  useEffect(() => {
    if (!menu) return undefined;

    const dismiss = () => setMenu(null);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') dismiss();
    };

    let cleanupPointerDown = null;
    const timer = window.setTimeout(() => {
      const onPointerDown = (event) => {
        if (event.target?.closest?.('[aria-label="View presets"]')) return;
        dismiss();
      };
      window.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('keydown', onKeyDown);
      cleanupPointerDown = onPointerDown;
    }, 0);

    return () => {
      window.clearTimeout(timer);
      if (cleanupPointerDown) {
        window.removeEventListener('pointerdown', cleanupPointerDown);
      }
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu]);

  const handleContextMenu = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const handlePreset = useCallback((presetId) => {
    onApplyPresetRef.current?.(presetId);
    setMenu(null);
  }, []);

  const menuPortal = menu ? createPortal(
    <div
      role="menu"
      aria-label="View presets"
      className="pointer-events-auto fixed z-[80] min-w-28 rounded-md border border-border bg-surface/95 p-1 shadow-xl backdrop-blur-sm"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {VIEW_NAVIGATOR_PRESETS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="menuitem"
          className="sans flex w-full rounded px-3 py-1.5 text-left text-xs text-secondary hover:bg-surface-muted hover:text-primary"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handlePreset(id);
          }}
        >
          {label}
        </button>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <div
        className={`flex flex-col items-center ${className}`.trim()}
        aria-label="View navigator gimbal"
        title="Right-click for view presets"
        onContextMenu={handleContextMenu}
      >
        <canvas
          ref={canvasRef}
          width={cubeSize}
          height={cubeSize}
          className="block drop-shadow-sm"
          style={{ width: `${cubeSize}px`, height: `${cubeSize}px` }}
        />
        <div
          ref={labelRef}
          className="mt-0.5 max-w-[4.5rem] truncate text-center text-[8px] font-medium uppercase tracking-[0.14em] text-muted"
          aria-live="polite"
        >
          ISO VIEW
        </div>
      </div>
      {menuPortal}
    </>
  );
}

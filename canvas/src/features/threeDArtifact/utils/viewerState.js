export const DEFAULT_THREE_D_VIEWER_STATE = {
  camera: {
    position: [4, 3, 6],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fov: 45,
  },
  displayMode: 'material',
  showGrid: false,
  showAxes: false,
  showBounds: false,
  showAnnotations: true,
  lightingMode: 'studio',
  showEnvironment: true,
  /** When true, restore `camera` from persisted viewer state instead of auto-fitting. */
  cameraSaved: false,
};

export function normalizeThreeDViewerState(state) {
  return {
    ...DEFAULT_THREE_D_VIEWER_STATE,
    ...(state ?? {}),
    camera: {
      ...DEFAULT_THREE_D_VIEWER_STATE.camera,
      ...(state?.camera ?? {}),
    },
    cameraSaved: Boolean(state?.cameraSaved),
  };
}

export function cameraStateFromControls(camera, controls) {
  const target = controls?.target;
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: target ? [target.x, target.y, target.z] : [0, 0, 0],
    up: [camera.up.x, camera.up.y, camera.up.z],
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
  };
}

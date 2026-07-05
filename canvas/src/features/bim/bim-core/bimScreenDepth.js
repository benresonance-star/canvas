/**
 * Screen depth buffer helpers — kept separate from bimClayRender to avoid a
 * circular import: types → bimSectioning → bimClayRender → types.
 */

export function populateScreenDepthFromScene(renderer, scene, camera) {
  if (!renderer || !scene || !camera) return false;

  const colorBuffer = renderer.state?.buffers?.color;
  const depthBuffer = renderer.state?.buffers?.depth;
  if (!colorBuffer || !depthBuffer) return false;

  const previousAutoClear = renderer.autoClear;
  const previousRenderTarget = renderer.getRenderTarget();

  renderer.setRenderTarget(null);
  renderer.autoClear = false;
  depthBuffer.setTest(true);
  depthBuffer.setMask(true);
  colorBuffer.setMask(false);
  colorBuffer.setLocked(true);
  renderer.clearDepth();
  renderer.render(scene, camera);
  colorBuffer.setLocked(false);
  colorBuffer.setMask(true);

  renderer.autoClear = previousAutoClear;
  renderer.setRenderTarget(previousRenderTarget);
  return true;
}

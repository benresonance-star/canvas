export const BIM_VIEW_THUMBNAIL_MAX_WIDTH = 320;
export const BIM_VIEW_THUMBNAIL_MAX_HEIGHT = 180;
export const BIM_VIEW_THUMBNAIL_MIME = 'image/jpeg';
export const BIM_VIEW_THUMBNAIL_QUALITY = 0.82;

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Viewport thumbnail export failed'))),
      mimeType,
      quality,
    );
  });
}

function resolveThumbnailSize(sourceWidth, sourceHeight, maxWidth, maxHeight) {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const scale = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1);
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

/**
 * Capture a downscaled JPEG thumbnail from the live BIM WebGL renderer.
 * @param {import('three').WebGLRenderer | null | undefined} renderer
 * @param {{
 *   maxWidth?: number,
 *   maxHeight?: number,
 *   mimeType?: string,
 *   quality?: number,
 * }} [options]
 * @returns {Promise<Blob>}
 */
export async function captureBimViewportThumbnail(renderer, {
  maxWidth = BIM_VIEW_THUMBNAIL_MAX_WIDTH,
  maxHeight = BIM_VIEW_THUMBNAIL_MAX_HEIGHT,
  mimeType = BIM_VIEW_THUMBNAIL_MIME,
  quality = BIM_VIEW_THUMBNAIL_QUALITY,
} = {}) {
  if (!renderer?.domElement) {
    throw new Error('BIM renderer is not ready for thumbnail capture');
  }
  const sourceCanvas = renderer.domElement;
  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('BIM viewport canvas has no drawable size');
  }

  const { width, height } = resolveThumbnailSize(
    sourceWidth,
    sourceHeight,
    maxWidth,
    maxHeight,
  );

  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = width;
  targetCanvas.height = height;
  const context = targetCanvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create thumbnail canvas context');
  }
  context.drawImage(sourceCanvas, 0, 0, width, height);
  return canvasToBlob(targetCanvas, mimeType, quality);
}

export { resolveThumbnailSize };

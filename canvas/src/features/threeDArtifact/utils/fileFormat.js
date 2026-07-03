export const SUPPORTED_THREE_D_FORMATS = ['glb', 'gltf'];
export const KNOWN_THREE_D_FORMATS = ['glb', 'gltf', 'obj', 'fbx', 'stl', 'ply', 'ifc'];

export function detectThreeDFormat(filename) {
  const ext = String(filename ?? '').split('.').pop()?.toLowerCase() ?? '';
  return KNOWN_THREE_D_FORMATS.includes(ext) ? ext : null;
}

export function isSupportedThreeDFormat(format) {
  return SUPPORTED_THREE_D_FORMATS.includes(String(format ?? '').toLowerCase());
}

export function formatThreeDSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '';
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

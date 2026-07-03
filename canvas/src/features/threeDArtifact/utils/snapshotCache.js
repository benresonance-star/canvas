/**
 * @param {string | null | undefined} projectId
 * @param {string | null | undefined} cardKey
 * @param {number | null | undefined} version
 * @param {string | null | undefined} environmentPreset
 */
export function threeDSnapshotCacheKey(projectId, cardKey, version, environmentPreset = 'studio') {
  if (!projectId || !cardKey || version == null) return null;
  const preset = environmentPreset || 'studio';
  return `${projectId}:${cardKey}:v${version}:3d-snapshot:${preset}`;
}

/**
 * @param {{
 *   content_hash?: string | null,
 *   threeDSnapshotCacheKey?: string | null,
 *   threeDSnapshotContentHash?: string | null,
 *   threeDSnapshotEnvironmentPreset?: string | null,
 * }} version
 * @param {string | null | undefined} environmentPreset
 */
export function threeDSnapshotNeedsCapture(version, environmentPreset = 'studio') {
  if (!version?.content_hash) return false;
  const preset = environmentPreset || 'studio';
  const storedPreset = version.threeDSnapshotEnvironmentPreset ?? 'studio';
  if (!version.threeDSnapshotCacheKey) return true;
  if (version.threeDSnapshotContentHash !== version.content_hash) return true;
  if (storedPreset !== preset) return true;
  return false;
}

/**
 * @param {{
 *   content_hash?: string | null,
 *   threeDSnapshotCacheKey?: string | null,
 *   threeDSnapshotContentHash?: string | null,
 *   threeDSnapshotEnvironmentPreset?: string | null,
 * }} version
 * @param {string | null | undefined} environmentPreset
 */
export function threeDSnapshotIsCurrent(version, environmentPreset = 'studio') {
  const preset = environmentPreset || 'studio';
  const storedPreset = version.threeDSnapshotEnvironmentPreset ?? 'studio';
  return Boolean(
    version?.threeDSnapshotCacheKey
    && version?.content_hash
    && version.threeDSnapshotContentHash === version.content_hash
    && storedPreset === preset,
  );
}

import crypto from 'node:crypto';

function pinnedVersion(entry) {
  return (entry?.versions ?? []).find((version) => version.version === entry?.pinnedVersion)
    ?? entry?.versions?.[0]
    ?? null;
}

export function artifactIdForUserNote(entry) {
  const ids = [...new Set(
    (entry?.versions ?? []).map((version) => version?.artifactRef?.id).filter(Boolean),
  )];
  return ids.length === 1 ? ids[0] : null;
}

export function artifactViewId({ projectId, artifactId, surface, viewType = 'card' }) {
  return crypto
    .createHash('sha256')
    .update(`${projectId}\0${artifactId}\0${surface}\0${viewType}`)
    .digest('hex');
}

export function legacyUserNoteToArtifactView(projectId, entry, surface) {
  if (!projectId || entry?.type !== 'user_note') return null;
  const artifactId = artifactIdForUserNote(entry);
  if (!artifactId) return null;
  const viewType = 'card';
  const base = {
    id: artifactViewId({ projectId, artifactId, surface, viewType }),
    projectId,
    artifactId,
    surface,
    viewType,
    viewState: {},
  };
  if (surface === 'dock') return base;
  return {
    ...base,
    x: Number(entry.x),
    y: Number(entry.y),
    width: Number(entry.width),
    height: Number(entry.height),
    zIndex: Number.isFinite(Number(entry.zIndex)) ? Number(entry.zIndex) : null,
  };
}

export function projectUserNoteViews(projectId, payload) {
  return [
    ...(payload?.cards ?? []).map((entry) => legacyUserNoteToArtifactView(projectId, entry, 'canvas')),
    ...(payload?.stagedSyncCards ?? []).map((entry) => legacyUserNoteToArtifactView(projectId, entry, 'dock')),
  ].filter(Boolean);
}

export function applyArtifactViewToLegacyCard(card, view) {
  if (!card || !view || view.surface !== 'canvas') return card;
  return {
    ...card,
    x: view.x,
    y: view.y,
    width: view.width,
    height: view.height,
    ...(view.zIndex == null ? {} : { zIndex: view.zIndex }),
  };
}

export function compareUserNoteView(legacy, canonical) {
  if (!canonical) return 'missing_view';
  const artifactId = artifactIdForUserNote(legacy);
  if (artifactId !== canonical.artifactId) return 'identity_mismatch';
  if (canonical.surface !== 'canvas') return 'surface_mismatch';
  for (const field of ['x', 'y', 'width', 'height']) {
    if (Number(legacy?.[field]) !== Number(canonical?.[field])) return 'geometry_mismatch';
  }
  if (
    canonical.zIndex != null
    && Number(legacy?.zIndex ?? 0) !== Number(canonical.zIndex)
  ) return 'geometry_mismatch';
  return null;
}

export function relativePathForUserNote(entry) {
  const version = pinnedVersion(entry);
  return version?.relativePath ?? version?.filename ?? null;
}

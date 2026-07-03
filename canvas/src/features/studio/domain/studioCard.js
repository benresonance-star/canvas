export function primaryStudioSurface(overviewOrCard) {
  const surfaces = overviewOrCard?.surfaces ?? overviewOrCard?.studioSurfaces ?? [];
  return surfaces.find((surface) => surface.isPrimary) ?? surfaces[0] ?? null;
}

export function studioIdFromCard(card) {
  const pinned = (card?.versions ?? []).find((version) => version.version === card?.pinnedVersion)
    ?? card?.versions?.[0];
  return card?.studioId ?? pinned?.studioId ?? pinned?.artifactRef?.id ?? null;
}

export function studioCardFromOverview(overview, position = { x: 100, y: 100 }, options = {}) {
  const studio = overview?.studio;
  if (!studio) return null;
  const primary = primaryStudioSurface(overview);
  const parentStudioId = studio.parentStudioId ?? null;
  const parentStudioTitle = options.parentStudioTitle
    ?? overview?.parentStudio?.title
    ?? overview?.parentStudioTitle
    ?? null;
  return {
    id: crypto.randomUUID(),
    key: `studios__${studio.id}`,
    prefix: 'studios',
    name: studio.title,
    type: 'studio',
    x: position.x,
    y: position.y,
    studioId: studio.id,
    studioKind: studio.studioKind,
    studioState: studio.state,
    studioSummary: studio.summary ?? '',
    parentStudioId,
    parentStudioTitle,
    studioSurfaces: overview.surfaces ?? [],
    studioCounts: overview.counts ?? {},
    primaryFlowId: primary?.artifactId ?? primary?.flow?.id ?? null,
    versions: [{
      version: 1,
      artifactRef: { id: studio.id, type: 'artifact' },
      studioId: studio.id,
      inline: true,
      ext: 'studio',
      filename: `${studio.title}.studio.json`,
    }],
    pinnedVersion: 1,
  };
}

export function patchStudioCard(card, overview) {
  const studio = overview?.studio;
  if (!studio) return {};
  const primary = primaryStudioSurface(overview);
  const parentStudioId = studio.parentStudioId ?? card.parentStudioId ?? null;
  const parentStudioTitle = overview?.parentStudio?.title
    ?? overview?.parentStudioTitle
    ?? card.parentStudioTitle
    ?? null;
  return {
    name: studio.title,
    studioKind: studio.studioKind,
    studioState: studio.state,
    studioSummary: studio.summary ?? '',
    parentStudioId,
    parentStudioTitle,
    studioSurfaces: overview.surfaces ?? [],
    studioCounts: overview.counts ?? {},
    primaryFlowId: primary?.artifactId ?? primary?.flow?.id ?? null,
    versions: (card.versions ?? []).map((version) =>
      version.version === card.pinnedVersion
        ? {
            ...version,
            studioId: studio.id,
            filename: `${studio.title}.studio.json`,
          }
        : version),
  };
}

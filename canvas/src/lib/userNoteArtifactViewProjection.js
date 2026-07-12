export function artifactIdForCard(card) {
  const ids = [...new Set(
    (card?.versions ?? []).map((version) => version?.artifactRef?.id).filter(Boolean),
  )];
  return ids.length === 1 ? ids[0] : null;
}

export function resolveArtifactViewMode(env = import.meta.env) {
  const mode = env?.VITE_USER_NOTE_ARTIFACT_VIEWS;
  return ['legacy', 'shadow', 'canonical'].includes(mode) ? mode : 'canonical';
}

export function resolveArtifactViewWriteMode(env = import.meta.env) {
  return env?.VITE_USER_NOTE_ARTIFACT_VIEW_WRITES === 'legacy' ? 'legacy' : 'canonical';
}

export function shouldReadUserNoteArtifactViews(mode, { localOnly = false } = {}) {
  if (mode === 'canonical') return true;
  if (mode === 'shadow') return !localOnly;
  return false;
}

export function composeUserNoteArtifactViews(payload, views, { mode = 'legacy' } = {}) {
  if (mode === 'legacy') return { payload, mismatches: [] };
  const viewsBySurface = new Map(
    views
      .filter((view) => view.viewType === 'card')
      .map((view) => [`${view.surface}:${view.artifactId}`, view]),
  );
  const mismatches = [];
  const composeEntries = (entries, surface) => (entries ?? []).map((card) => {
    if (card?.type !== 'user_note') return card;
    const artifactId = artifactIdForCard(card);
    const view = artifactId ? viewsBySurface.get(`${surface}:${artifactId}`) : null;
    if (!view) {
      mismatches.push({ category: 'missing_view', artifactId, cardId: card.id ?? null });
      return card;
    }
    const geometryFields = ['x', 'y', 'width', 'height'];
    const presentGeometry = geometryFields.filter(
      (field) => card[field] !== undefined && card[field] !== null,
    );
    const geometryMismatch = surface === 'canvas'
      && presentGeometry.length > 0
      && (
        presentGeometry.length !== geometryFields.length
        || geometryFields.some((field) => Number(card[field]) !== Number(view[field]))
      );
    if (geometryMismatch) {
      mismatches.push({ category: 'geometry_mismatch', artifactId, cardId: card.id ?? null });
    }
    if (mode !== 'canonical') return card;
    return surface === 'canvas' ? {
      ...card,
      x: view.x,
      y: view.y,
      width: view.width,
      height: view.height,
      ...(view.zIndex == null ? {} : { zIndex: view.zIndex }),
      artifactViewVersion: view.version,
    } : {
      ...card,
      artifactViewVersion: view.version,
    };
  });
  return {
    payload: {
      ...payload,
      cards: composeEntries(payload?.cards, 'canvas'),
      stagedSyncCards: composeEntries(payload?.stagedSyncCards, 'dock'),
    },
    mismatches,
  };
}

export function summarizeUserNoteArtifactViewComparison(payload, mismatches) {
  const eligibleCards = (payload?.cards ?? []).filter((card) => card?.type === 'user_note').length;
  const counts = { loads: 1, eligible_cards: eligibleCards };
  for (const mismatch of mismatches ?? []) {
    counts[mismatch.category] = (counts[mismatch.category] ?? 0) + 1;
  }
  const mismatchedCards = new Set(
    (mismatches ?? []).map((mismatch) => mismatch.cardId).filter(Boolean),
  ).size;
  counts.matched_cards = Math.max(0, eligibleCards - mismatchedCards);
  return counts;
}

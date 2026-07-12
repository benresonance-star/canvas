function artifactIdForCard(card) {
  const ids = [...new Set(
    (card?.versions ?? []).map((version) => version?.artifactRef?.id).filter(Boolean),
  )];
  return ids.length === 1 ? ids[0] : null;
}

export function resolveArtifactViewMode(env = import.meta.env) {
  const mode = env?.VITE_USER_NOTE_ARTIFACT_VIEWS;
  return ['legacy', 'shadow', 'canonical'].includes(mode) ? mode : 'legacy';
}

export function composeUserNoteArtifactViews(payload, views, { mode = 'legacy' } = {}) {
  if (mode === 'legacy') return { payload, mismatches: [] };
  const canvasViews = new Map(
    views
      .filter((view) => view.viewType === 'card' && view.surface === 'canvas')
      .map((view) => [view.artifactId, view]),
  );
  const mismatches = [];
  const cards = (payload?.cards ?? []).map((card) => {
    if (card?.type !== 'user_note') return card;
    const artifactId = artifactIdForCard(card);
    const view = artifactId ? canvasViews.get(artifactId) : null;
    if (!view) {
      mismatches.push({ category: 'missing_view', artifactId, cardId: card.id ?? null });
      return card;
    }
    const geometryMismatch = ['x', 'y', 'width', 'height'].some(
      (field) => Number(card[field]) !== Number(view[field]),
    );
    if (geometryMismatch) {
      mismatches.push({ category: 'geometry_mismatch', artifactId, cardId: card.id ?? null });
    }
    if (mode !== 'canonical') return card;
    return {
      ...card,
      x: view.x,
      y: view.y,
      width: view.width,
      height: view.height,
      ...(view.zIndex == null ? {} : { zIndex: view.zIndex }),
    };
  });
  return { payload: { ...payload, cards }, mismatches };
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

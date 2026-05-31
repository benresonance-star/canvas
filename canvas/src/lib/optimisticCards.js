/** Cards added/edited locally before server document includes them. */

/** @type {Map<string, Set<string>>} */
const optimisticIdsByProject = new Map();

export function registerOptimisticCard(projectId, cardId) {
  if (!projectId || !cardId) return;
  let set = optimisticIdsByProject.get(projectId);
  if (!set) {
    set = new Set();
    optimisticIdsByProject.set(projectId, set);
  }
  set.add(cardId);
}

export function clearOptimisticCard(projectId, cardId) {
  const set = optimisticIdsByProject.get(projectId);
  if (!set) return;
  set.delete(cardId);
  if (set.size === 0) optimisticIdsByProject.delete(projectId);
}

export function clearOptimisticProject(projectId) {
  if (projectId) optimisticIdsByProject.delete(projectId);
}

/**
 * Union server payload with local optimistic cards not yet on server.
 * @param {string} projectId
 * @param {object | null} serverDoc
 * @param {object[]} localCards
 */
export function mergeOptimisticCardsIntoDoc(projectId, serverDoc, localCards) {
  if (!serverDoc) return serverDoc;
  const ids = optimisticIdsByProject.get(projectId);
  if (!ids?.size) return serverDoc;

  const serverCards = Array.isArray(serverDoc.cards) ? serverDoc.cards : [];
  const serverKeys = new Set(
    serverCards.map((c) => c.key || c.id).filter(Boolean),
  );

  const extras = (localCards ?? []).filter((c) => {
    if (!c?.id || !ids.has(c.id)) return false;
    const k = c.key || c.id;
    return !serverKeys.has(k);
  });

  if (extras.length === 0) return serverDoc;
  return {
    ...serverDoc,
    cards: [...serverCards, ...extras],
  };
}

/** @internal */
export function resetOptimisticCardsForTests() {
  optimisticIdsByProject.clear();
}

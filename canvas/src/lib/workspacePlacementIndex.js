import { artifactRefIdForClusterCard } from './clusterMembers.js';

/**
 * @param {string} type
 * @param {string} id
 */
export function primitivePlacementKey(type, id) {
  if (!type || !id) return '';
  return `${type}:${id}`;
}

/**
 * @param {Map<string, 'canvas' | 'dock'>} index
 * @param {string} type
 * @param {string} id
 * @param {'canvas' | 'dock'} surface
 */
function setPlacement(index, type, id, surface) {
  const key = primitivePlacementKey(type, id);
  if (!key) return;
  const existing = index.get(key);
  if (existing === 'canvas') return;
  if (surface === 'canvas' || !existing) {
    index.set(key, surface);
  }
}

/**
 * @param {Map<string, 'canvas' | 'dock'>} index
 * @param {object[]} cards
 * @param {'canvas' | 'dock'} surface
 * @param {{ threads?: object[], connectorId?: string }} options
 */
function registerCardPlacements(index, cards, surface, options) {
  for (const card of cards ?? []) {
    const artifactId = artifactRefIdForClusterCard(card, options);
    if (artifactId) {
      setPlacement(index, 'artifact', artifactId, surface);
    }
  }
}

/**
 * @param {Map<string, { cardId?: string, surface: 'canvas' | 'dock' }>} byPrimitiveKey
 * @param {Map<string, string>} byCardId
 * @param {object[]} cards
 * @param {'canvas' | 'dock'} surface
 * @param {{ threads?: object[], connectorId?: string }} options
 */
function registerCardSelectionRefs(byPrimitiveKey, byCardId, cards, surface, options) {
  for (const card of cards ?? []) {
    const artifactId = artifactRefIdForClusterCard(card, options);
    const key = primitivePlacementKey('artifact', artifactId);
    if (!key) continue;

    const cardId = card?.id ?? card?.stagingId;
    const existing = byPrimitiveKey.get(key);
    if (!existing || surface === 'canvas') {
      byPrimitiveKey.set(key, { cardId, surface });
    }
    if (cardId) {
      byCardId.set(cardId, key);
    }
  }
}

/**
 * Map primitive ref keys to canvas/dock placement from active project cards.
 * @param {{ cards?: object[], stagedSyncCards?: object[], threads?: object[], connectorId?: string }} input
 * @returns {Map<string, 'canvas' | 'dock'>}
 */
export function buildPrimitivePlacementIndex({
  cards = [],
  stagedSyncCards = [],
  threads = [],
  connectorId = '',
} = {}) {
  const index = new Map();
  const options = { threads, connectorId };
  registerCardPlacements(index, stagedSyncCards, 'dock', options);
  registerCardPlacements(index, cards, 'canvas', options);
  return index;
}

/**
 * Map active project primitive refs to the card/dock records they came from.
 * @param {{ cards?: object[], stagedSyncCards?: object[], threads?: object[], connectorId?: string }} input
 * @returns {{ byPrimitiveKey: Map<string, { cardId?: string, surface: 'canvas' | 'dock' }>, byCardId: Map<string, string> }}
 */
export function buildPrimitiveSelectionIndex({
  cards = [],
  stagedSyncCards = [],
  threads = [],
  connectorId = '',
} = {}) {
  const byPrimitiveKey = new Map();
  const byCardId = new Map();
  const options = { threads, connectorId };
  registerCardSelectionRefs(byPrimitiveKey, byCardId, stagedSyncCards, 'dock', options);
  registerCardSelectionRefs(byPrimitiveKey, byCardId, cards, 'canvas', options);
  return { byPrimitiveKey, byCardId };
}

/**
 * @param {object[]} items
 * @param {Map<string, 'canvas' | 'dock'>} index
 */
export function filterWorkspaceItemsToPlacementIndex(items = [], index = new Map()) {
  if (!index?.size) return [];
  return (items ?? []).filter((item) =>
    index.has(primitivePlacementKey(item?.type, item?.id)),
  );
}

/**
 * @param {object[]} events
 * @param {Map<string, 'canvas' | 'dock'>} index
 */
export function filterWorkspaceEventsToPlacementIndex(events = [], index = new Map()) {
  if (!index?.size) return [];
  return (events ?? []).filter((event) =>
    index.has(primitivePlacementKey(event?.target_type, event?.target_id)),
  );
}

/**
 * @param {object} node
 * @returns {{ canvas: number, dock: number }}
 */
function sumPlacementFromChildren(node) {
  let canvas = 0;
  let dock = 0;
  for (const child of node.children ?? []) {
    if (child.placement === 'canvas') canvas += 1;
    else if (child.placement === 'dock') dock += 1;
    if (child.placementSummary) {
      canvas += child.placementSummary.canvas;
      dock += child.placementSummary.dock;
    }
  }
  return { canvas, dock };
}

/**
 * Attach placement + placementSummary to workspace tree nodes (immutable shallow copy).
 * @param {object} tree
 * @param {Map<string, 'canvas' | 'dock'>} index
 */
export function decorateWorkspacePlacement(tree, index) {
  if (!tree) return tree;
  if (!index?.size) return tree;
  return decorateWorkspacePlacementStructure(tree, index);
}

/**
 * @param {object | null | undefined} tree
 * @param {Map<string, 'canvas' | 'dock'>} index
 */
function decorateWorkspacePlacementStructure(tree, index) {
  if (!tree) return tree;

  const next = { ...tree };

  if (tree.kind === 'leaf' && tree.primitiveRef) {
    const key = primitivePlacementKey(tree.primitiveRef.type, tree.primitiveRef.id);
    const placement = index.get(key);
    if (placement) next.placement = placement;
  }

  if (tree.children?.length) {
    next.children = tree.children.map((child) =>
      decorateWorkspacePlacementStructure(child, index),
    );
    const { canvas, dock } = sumPlacementFromChildren(next);
    if (canvas || dock) {
      next.placementSummary = { canvas, dock };
    }
  }

  return next;
}

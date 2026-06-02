import { moveToCanvas } from './artifactPlacement.js';
import { attachArtifactPlacementsToPayload } from './artifactPlacementsMap.js';

const DEFAULT_START_X = 120;
const DEFAULT_START_Y = 120;
const DEFAULT_GAP_X = 320;
const DEFAULT_GAP_Y = 240;
const DEFAULT_COLS = 4;

/**
 * Place every staged sync card onto the canvas in a simple grid.
 * @param {object[]} cards
 * @param {object[]} stagedSyncCards
 * @param {{ startX?: number, startY?: number, gapX?: number, gapY?: number, cols?: number }} [opts]
 */
export function restoreAllStagedToCanvas(
  cards,
  stagedSyncCards,
  opts = {},
) {
  const startX = opts.startX ?? DEFAULT_START_X;
  const startY = opts.startY ?? DEFAULT_START_Y;
  const gapX = opts.gapX ?? DEFAULT_GAP_X;
  const gapY = opts.gapY ?? DEFAULT_GAP_Y;
  const cols = opts.cols ?? DEFAULT_COLS;

  let nextCards = [...(cards ?? [])];
  let nextStaged = [...(stagedSyncCards ?? [])];
  const toPlace = [...nextStaged];
  let restored = 0;

  for (let i = 0; i < toPlace.length; i += 1) {
    const staged = toPlace[i];
    const stagingId = staged?.stagingId;
    if (!stagingId) continue;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const worldX = startX + col * gapX;
    const worldY = startY + row * gapY;
    const result = moveToCanvas(nextCards, nextStaged, stagingId, worldX, worldY);
    if (result.placed) {
      restored += 1;
      nextCards = result.cards;
      nextStaged = result.stagedSyncCards;
    }
  }

  return { cards: nextCards, stagedSyncCards: nextStaged, restored };
}

/**
 * @param {object} doc project document fields (cards, stagedSyncCards, canvasView, …)
 * @param {object[]} stagedSyncCards
 */
export function buildPayloadAfterDockRestore(doc, stagedSyncCards) {
  const { restored, cards, stagedSyncCards: staged } = restoreAllStagedToCanvas(
    doc?.cards ?? [],
    stagedSyncCards,
  );
  const base = {
    ...doc,
    cards,
    stagedSyncCards: staged,
  };
  return {
    payload: attachArtifactPlacementsToPayload(base, staged),
    restored,
  };
}

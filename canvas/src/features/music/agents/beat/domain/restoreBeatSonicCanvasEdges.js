import { SONIC_VOICE_BEAT_RELATIONSHIP_TYPE } from './wireSonicVoiceToBeatAgent.js';

export function findBeatCardForAgent(cards = [], agentId) {
  if (!agentId) return null;
  return cards.find((card) => (
    card.musicAgentId === agentId
    || card.versions?.some((version) => version.musicAgentId === agentId)
  )) ?? null;
}

export function sonicBeatEdgeExists(canvasEdges = [], sonicCardId, beatCardId) {
  return canvasEdges.some((edge) => (
    edge.fromCardId === sonicCardId
    && edge.toCardId === beatCardId
    && edge.type === SONIC_VOICE_BEAT_RELATIONSHIP_TYPE
  ));
}

/**
 * @param {{ links?: object[], cards?: object[], canvasEdges?: object[] }} params
 * @returns {Array<{ sonicCard: object, beatCard: object, link: object }>}
 */
export function collectMissingSonicBeatEdges({
  links = [],
  cards = [],
  canvasEdges = [],
} = {}) {
  const missing = [];
  const seen = new Set();

  for (const link of links) {
    const beatCard = findBeatCardForAgent(cards, link.agentId);
    const sonicCard = cards.find((card) => card.id === link.sonicCardId);
    if (!beatCard || !sonicCard) continue;
    const key = `${link.sonicCardId}:${beatCard.id}`;
    if (seen.has(key)) continue;
    if (sonicBeatEdgeExists(canvasEdges, link.sonicCardId, beatCard.id)) continue;
    seen.add(key);
    missing.push({ sonicCard, beatCard, link });
  }

  return missing;
}

/**
 * Ensure canvas graph relationships exist for persisted beat ↔ sonic links.
 * @param {{
 *   clusterId: string,
 *   links?: object[],
 *   cards?: object[],
 *   canvasEdges?: object[],
 *   wireFn?: Function,
 * }} params
 */
export async function restoreBeatSonicCanvasEdges({
  clusterId,
  links = [],
  cards = [],
  canvasEdges = [],
  wireFn,
} = {}) {
  if (!clusterId || typeof wireFn !== 'function') {
    return { restored: 0, attempted: 0, results: [] };
  }

  const missing = collectMissingSonicBeatEdges({ links, cards, canvasEdges });
  const results = [];

  for (const { sonicCard, beatCard, link } of missing) {
    try {
      const result = await wireFn({
        clusterId,
        sonicCard,
        beatCard,
        trackId: link.trackId,
        voiceId: link.voiceId,
      });
      results.push(result);
    } catch {
      results.push({ created: false, error: true });
    }
  }

  return {
    restored: results.filter((result) => result?.created || result?.relationship).length,
    attempted: missing.length,
    results,
  };
}

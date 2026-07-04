import { isTrackSonicVoiceStale } from './beatTrackSoundSource.js';

export function findSonicStudioCardsLinkedToBeat(beatCardId, canvasEdges = [], cards = []) {
  if (!beatCardId) return [];
  const linkedIds = new Set();
  for (const edge of canvasEdges) {
    if (edge.toCardId !== beatCardId || !edge.fromCardId) continue;
    const fromCard = cards.find((card) => card.id === edge.fromCardId);
    if (fromCard?.type === 'sonic_studio') linkedIds.add(fromCard.id);
  }
  return [...linkedIds]
    .map((id) => cards.find((card) => card.id === id))
    .filter(Boolean);
}

export function listStaleSonicBeatTracks(pattern, cards = []) {
  return (pattern?.tracks ?? []).filter((track) => {
    if (track?.soundSource !== 'sonic_voice' || !track?.sonicProvenance?.cardId) return false;
    const sonicCard = cards.find((card) => card.id === track.sonicProvenance.cardId);
    return sonicCard ? isTrackSonicVoiceStale(track, sonicCard) : false;
  });
}

export function summarizeBeatSonicLinks({
  beatCardId,
  pattern,
  canvasEdges = [],
  cards = [],
} = {}) {
  const linkedCards = findSonicStudioCardsLinkedToBeat(beatCardId, canvasEdges, cards);
  const staleTracks = listStaleSonicBeatTracks(pattern, cards);
  const assignedTracks = (pattern?.tracks ?? []).filter(
    (track) => track?.soundSource === 'sonic_voice' && track?.sonicVoice,
  );
  return {
    linkedCards,
    staleTracks,
    assignedTracks,
    hasStale: staleTracks.length > 0,
  };
}

import { updateBeatTrackSoundState } from './beatRuntimeState.js';
import {
  findSonicStudioCards,
  isTrackSonicVoiceStale,
  refreshTrackFromSonicCard,
} from './beatTrackSoundSource.js';

/**
 * Refresh beat tracks whose Sonic provenance no longer matches linked Sonic cards.
 * @param {object} state
 * @param {object[]} cards
 * @returns {{ state: object, changed: boolean, refreshedTrackIds: string[] }}
 */
export function sweepStaleBeatTracksInState(state, cards = []) {
  const sonicById = new Map(findSonicStudioCards(cards).map((card) => [card.id, card]));
  if (!state?.pattern?.tracks?.length || sonicById.size === 0) {
    return { state, changed: false, refreshedTrackIds: [] };
  }

  let nextState = state;
  const refreshedTrackIds = [];

  for (const track of state.pattern.tracks) {
    const cardId = track?.sonicProvenance?.cardId;
    if (!cardId || track?.soundSource !== 'sonic_voice') continue;
    const sonicCard = sonicById.get(cardId);
    if (!sonicCard || !isTrackSonicVoiceStale(track, sonicCard)) continue;
    const refreshed = refreshTrackFromSonicCard(track, sonicCard);
    const result = updateBeatTrackSoundState(nextState, track.id, refreshed);
    if (!result.ok) continue;
    nextState = result.state;
    refreshedTrackIds.push(track.id);
  }

  return {
    state: nextState,
    changed: refreshedTrackIds.length > 0,
    refreshedTrackIds,
  };
}

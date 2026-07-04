/**
 * Beat agent ↔ Sonic Studio link records (mirrors music_beat_sonic_link table).
 */

export function extractBeatSonicLinksFromState(state, {
  agentId,
  projectId,
} = {}) {
  if (!agentId || !projectId || !state?.pattern?.tracks) return [];
  const links = [];
  for (const track of state.pattern.tracks) {
    if (track?.soundSource !== 'sonic_voice' || !track?.sonicVoice) continue;
    const provenance = track.sonicProvenance ?? {};
    links.push({
      agentId,
      projectId,
      trackId: track.id,
      sonicCardId: provenance.cardId ?? null,
      sonicStudioId: provenance.sonicStudioId ?? null,
      voiceId: provenance.voiceId ?? track.sonicVoice.id ?? null,
      stateHash: provenance.stateHash ?? null,
      renderedAssetId: provenance.renderedAssetId ?? null,
      soundSource: 'sonic_voice',
      sonicVoice: track.sonicVoice,
      assignedAt: provenance.assignedAt ?? null,
    });
  }
  return links.filter((link) => link.sonicCardId && link.voiceId);
}

export function applyBeatSonicLinksToState(state, links = []) {
  if (!state?.pattern?.tracks?.length || !links.length) return state;
  const byTrackId = new Map(links.map((link) => [link.trackId, link]));
  return {
    ...state,
    pattern: {
      ...state.pattern,
      tracks: state.pattern.tracks.map((track) => {
        const link = byTrackId.get(track.id);
        if (!link) {
          if (track.soundSource === 'sonic_voice') {
            return clearTrackSonicFields(track);
          }
          return track;
        }
        return mergeTrackWithSonicLink(track, link);
      }),
    },
  };
}

export function mergeTrackWithSonicLink(track, link) {
  return {
    ...track,
    soundSource: link.soundSource === 'generated' ? 'generated' : 'sonic_voice',
    sonicVoice: link.sonicVoice ?? track.sonicVoice ?? null,
    sonicProvenance: {
      cardId: link.sonicCardId ?? link.sonic_card_id ?? null,
      voiceId: link.voiceId ?? link.voice_id ?? null,
      stateHash: link.stateHash ?? link.state_hash ?? null,
      renderedAssetId: link.renderedAssetId ?? link.rendered_asset_id ?? null,
      assignedAt: link.assignedAt ?? link.assigned_at ?? track.sonicProvenance?.assignedAt ?? null,
    },
  };
}

function clearTrackSonicFields(track) {
  return {
    ...track,
    soundSource: 'generated',
    sonicVoice: null,
    sonicProvenance: null,
  };
}

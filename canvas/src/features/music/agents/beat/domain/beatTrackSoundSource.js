import { createDefaultPercussionKit, hashSonicSourceState } from '../../../../../../packages/sonic-core/src/index.js';
import {
  bakeSonicRenderedAssets,
  findSonicRenderedAsset,
} from '../../../../sonicStudio/domain/sonicRenderedAssets.js';
import {
  buildSonicStudioCardPatch,
  normalizeSonicStudioCardState,
  replaceSonicVoiceInState,
} from '../../../../sonicStudio/domain/sonicStudioCard.js';
import { mergeVoicePatch } from '../../../../sonicStudio/domain/sonicVoiceParams.js';
import { normalizeBeatTrack } from './beatTrackSynth.js';

const TRACK_ROLE_TO_KIT_KEY = {
  kick: 'kick',
  snare: 'snare',
  hat: 'hat',
  'hat-closed': 'hat',
  clap: 'cymbal',
  cymbal: 'cymbal',
};

export function resolveSonicStudioCardState(sonicCard) {
  return normalizeSonicStudioCardState(sonicCard ?? {});
}

export function getSonicStudioCardVoices(sonicCard) {
  return resolveSonicStudioCardState(sonicCard).voices ?? [];
}

function kitKeyForTrack(track) {
  const role = track?.role ?? track?.id ?? 'snare';
  return TRACK_ROLE_TO_KIT_KEY[role] ?? 'snare';
}

export function createEmbeddedSonicVoiceForTrack(track) {
  const kit = createDefaultPercussionKit();
  const kitKey = kitKeyForTrack(track);
  const template = kit[kitKey] ?? kit.snare;
  const trackId = track?.id ?? 'track';
  return structuredClone({
    ...template,
    id: `${trackId}-embedded-sonic`,
    name: track?.name ? `${track.name} Sonic` : template.name,
  });
}

export function assignSonicVoiceToTrack(track, {
  voice,
  cardId,
  voiceId,
  stateHash,
  renderedAssetId,
  source,
  syncToCard,
  cardVoiceHashAtAssign,
  assignedAt,
} = {}) {
  if (!voice) return track;
  const resolvedSource = source ?? (cardId ? 'card' : 'embedded');
  const resolvedStateHash = stateHash ?? hashSonicSourceState({ voices: [voice] });
  const resolvedCardVoiceHashAtAssign = cardVoiceHashAtAssign
    ?? (cardId ? resolvedStateHash : null);
  return normalizeBeatTrack({
    ...track,
    soundSource: 'sonic_voice',
    sonicVoice: voice,
    sonicProvenance: {
      cardId: cardId ?? null,
      voiceId: voiceId ?? voice.id ?? null,
      stateHash: resolvedStateHash,
      cardVoiceHashAtAssign: resolvedCardVoiceHashAtAssign,
      renderedAssetId: renderedAssetId ?? null,
      assignedAt: assignedAt ?? track?.sonicProvenance?.assignedAt ?? new Date().toISOString(),
      source: resolvedSource,
      syncToCard: syncToCard ?? false,
    },
  });
}

export function assignEmbeddedSonicToTrack(track) {
  const voice = createEmbeddedSonicVoiceForTrack(track);
  return assignSonicVoiceToTrack(track, {
    voice,
    cardId: null,
    voiceId: voice.id,
    stateHash: hashSonicSourceState({ voices: [voice] }),
    renderedAssetId: null,
    source: 'embedded',
    syncToCard: false,
  });
}

export function updateTrackSonicVoice(track, patch = {}) {
  if (!track?.sonicVoice) return track;
  const nextVoice = mergeVoicePatch(track.sonicVoice, patch);
  const nextStateHash = hashSonicSourceState({ voices: [nextVoice] });
  const syncToCard = track.sonicProvenance?.syncToCard ?? false;
  return assignSonicVoiceToTrack(track, {
    voice: nextVoice,
    cardId: track.sonicProvenance?.cardId ?? null,
    voiceId: track.sonicProvenance?.voiceId ?? nextVoice.id,
    stateHash: nextStateHash,
    renderedAssetId: null,
    source: track.sonicProvenance?.source ?? 'embedded',
    syncToCard,
    cardVoiceHashAtAssign: syncToCard
      ? nextStateHash
      : track.sonicProvenance?.cardVoiceHashAtAssign ?? null,
  });
}

export function buildLinkedSonicCardSyncPatch(track, sonicCard) {
  const cardId = track?.sonicProvenance?.cardId;
  if (!cardId || !track?.sonicProvenance?.syncToCard || !track?.sonicVoice) return null;
  if (!sonicCard || sonicCard.id !== cardId) return null;
  const voiceId = track.sonicProvenance.voiceId;
  const state = resolveSonicStudioCardState(sonicCard);
  const nextState = replaceSonicVoiceInState(state, voiceId, track.sonicVoice);
  const renderedAssets = bakeSonicRenderedAssets(nextState, {
    previousAssets: sonicCard.sonicRenderedAssets ?? [],
  });
  return {
    cardId,
    patch: buildSonicStudioCardPatch(nextState, renderedAssets),
  };
}

export function clearTrackSonicVoice(track) {
  return {
    ...track,
    soundSource: 'generated',
    sonicVoice: null,
    sonicProvenance: null,
  };
}

export function isTrackSonicVoiceStale(track, sonicCard) {
  if (track?.soundSource !== 'sonic_voice' || !track?.sonicProvenance) return false;
  const provenance = track.sonicProvenance;
  if (!provenance.cardId) return false;
  if (provenance.cardId && sonicCard?.id && provenance.cardId !== sonicCard.id) return false;
  const cardBaseline = provenance.cardVoiceHashAtAssign;
  if (!cardBaseline) return false;
  const voiceId = provenance.voiceId;
  const voices = getSonicStudioCardVoices(sonicCard);
  const liveVoice = voices.find((voice) => voice.id === voiceId) ?? voices[0];
  if (!liveVoice) return false;
  const liveHash = hashSonicSourceState({ voices: [liveVoice] });
  return cardBaseline !== liveHash;
}

export function refreshTrackFromSonicCard(track, sonicCard, voiceId = track?.sonicProvenance?.voiceId) {
  const state = resolveSonicStudioCardState(sonicCard);
  const voice = state.voices.find((candidate) => candidate.id === voiceId) ?? state.voices[0];
  if (!voice) return track;
  const stateHash = hashSonicSourceState({ voices: [voice] });
  const renderedAsset = findSonicRenderedAsset(sonicCard?.sonicRenderedAssets ?? [], {
    voiceId: voice.id,
    sourceStateHash: stateHash,
    renderedAssetId: track?.sonicProvenance?.renderedAssetId,
  });
  return assignSonicVoiceToTrack(track, {
    voice: structuredClone(voice),
    cardId: sonicCard?.id ?? sonicCard?.sonicStudioId,
    voiceId: voice.id,
    stateHash,
    cardVoiceHashAtAssign: stateHash,
    renderedAssetId: renderedAsset?.id ?? null,
    source: 'card',
    syncToCard: track.sonicProvenance?.syncToCard ?? false,
  });
}

export function findSonicStudioCards(cards = []) {
  return cards.filter((card) => card?.type === 'sonic_studio');
}

export function copySonicTemporalFromCard(sonicCard) {
  return resolveSonicStudioCardState(sonicCard).temporal ?? null;
}

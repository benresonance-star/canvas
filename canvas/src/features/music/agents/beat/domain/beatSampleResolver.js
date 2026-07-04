import {
  renderBeatTrackSample,
  renderSonicVoiceSample,
} from '../../../../../../packages/sonic-core/src/index.js';
import {
  findSonicRenderedAsset,
  renderedAssetToChannelBuffers,
} from '../../../../sonicStudio/domain/sonicRenderedAssets.js';

const DEFAULT_SAMPLE_RATE = 48000;

export function beatTrackSampleSignature(track, sampleRate = DEFAULT_SAMPLE_RATE) {
  return JSON.stringify({
    id: track?.id,
    role: track?.role,
    gain: track?.gain,
    synth: track?.synth,
    soundSource: track?.soundSource,
    sonicVoiceId: track?.sonicVoice?.id,
    sonicStateHash: track?.sonicProvenance?.stateHash,
    renderedAssetId: track?.sonicProvenance?.renderedAssetId,
    sampleRate,
  });
}

export function findRenderedAssetForTrack(track, cards = []) {
  if (track?.soundSource !== 'sonic_voice' || !track?.sonicProvenance) return null;
  const sonicCard = cards.find((card) => card.id === track.sonicProvenance.cardId);
  if (!sonicCard) return null;
  return findSonicRenderedAsset(sonicCard.sonicRenderedAssets ?? [], {
    voiceId: track.sonicProvenance.voiceId,
    sourceStateHash: track.sonicProvenance.stateHash,
    renderedAssetId: track.sonicProvenance.renderedAssetId,
  });
}

export function resolveBeatTrackSample(track, {
  sampleRate = DEFAULT_SAMPLE_RATE,
  seed,
  cards = [],
} = {}) {
  const signature = beatTrackSampleSignature(track, sampleRate);
  const renderedAsset = findRenderedAssetForTrack(track, cards);
  if (renderedAsset && track?.soundSource === 'sonic_voice') {
    const channels = renderedAssetToChannelBuffers(renderedAsset);
    return {
      id: track?.id ?? track?.role ?? 'track',
      role: track?.role ?? track?.id ?? 'snare',
      sampleRate: renderedAsset.sampleRate ?? sampleRate,
      left: channels.left,
      right: channels.right,
      signature,
      source: 'rendered_asset',
    };
  }

  const rendered = track?.soundSource === 'sonic_voice' && track?.sonicVoice
    ? renderSonicVoiceSample(track.sonicVoice, {
      sampleRate,
      seed: seed ?? hashString(signature),
    })
    : renderBeatTrackSample(track, {
      sampleRate,
      seed: seed ?? hashString(signature),
    });
  return {
    ...rendered,
    signature,
    sampleRate,
    source: track?.soundSource === 'sonic_voice' ? 'sonic_voice' : 'generated',
  };
}

export function createBeatSonicSampleMapForPattern(pattern, {
  sampleRate = DEFAULT_SAMPLE_RATE,
  seed = 1,
  cards = [],
} = {}) {
  const samples = {};
  for (const track of pattern?.tracks ?? []) {
    const rendered = resolveBeatTrackSample(track, {
      sampleRate,
      cards,
      seed: hashString(`${seed}:${track.id}:${beatTrackSampleSignature(track, sampleRate)}`),
    });
    const sample = {
      left: rendered.left,
      right: rendered.right,
    };
    samples[track.id] = sample;
    if (track.role && track.role !== track.id) samples[track.role] = sample;
  }
  return samples;
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < String(text).length; index += 1) {
    hash ^= String(text).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

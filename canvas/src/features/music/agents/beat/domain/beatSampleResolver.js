import { createBeatSonicSampleMap, renderBeatTrackSample } from '../../../../../../packages/sonic-core/src/index.js';

const DEFAULT_SAMPLE_RATE = 48000;

export function beatTrackSampleSignature(track, sampleRate = DEFAULT_SAMPLE_RATE) {
  return JSON.stringify({
    id: track?.id,
    role: track?.role,
    gain: track?.gain,
    synth: track?.synth,
    sampleRate,
  });
}

export function resolveBeatTrackSample(track, {
  sampleRate = DEFAULT_SAMPLE_RATE,
  seed,
} = {}) {
  const signature = beatTrackSampleSignature(track, sampleRate);
  const rendered = renderBeatTrackSample(track, {
    sampleRate,
    seed: seed ?? hashString(signature),
  });
  return {
    ...rendered,
    signature,
    sampleRate,
  };
}

export function createBeatSonicSampleMapForPattern(pattern, {
  sampleRate = DEFAULT_SAMPLE_RATE,
  seed = 1,
} = {}) {
  return createBeatSonicSampleMap(pattern, { sampleRate, seed });
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < String(text).length; index += 1) {
    hash ^= String(text).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

import {
  hashSonicSourceState,
  renderSonicVoiceSample,
} from '../../../../packages/sonic-core/src/index.js';
import { normalizeSonicStudioCardState } from './sonicStudioCard.js';

const DEFAULT_SAMPLE_RATE = 48000;

export function voiceSourceStateHash(voice) {
  return hashSonicSourceState({ voices: [voice] });
}

export function findSonicRenderedAsset(assets = [], { voiceId, sourceStateHash, renderedAssetId } = {}) {
  if (renderedAssetId) {
    const byId = assets.find((asset) => asset.id === renderedAssetId);
    if (byId?.channels?.left?.length) return byId;
  }
  if (!voiceId) return null;
  return assets.find((asset) => (
    asset.voiceId === voiceId
    && (!sourceStateHash || asset.sourceStateHash === sourceStateHash)
    && asset.channels?.left?.length
  )) ?? null;
}

export function renderedAssetToChannelBuffers(asset) {
  if (!asset?.channels?.left?.length) return null;
  return {
    left: Float32Array.from(asset.channels.left),
    right: Float32Array.from(asset.channels.right ?? asset.channels.left),
  };
}

export function bakeSonicRenderedAssets(engineState, {
  previousAssets = [],
  sampleRate = DEFAULT_SAMPLE_RATE,
  seed = 1,
} = {}) {
  const state = normalizeSonicStudioCardState({ sonicStudioState: engineState });
  const previousByVoice = new Map((previousAssets ?? []).map((asset) => [asset.voiceId, asset]));

  return (state.voices ?? []).map((voice) => {
    const sourceStateHash = voiceSourceStateHash(voice);
    const previous = previousByVoice.get(voice.id);
    if (
      previous?.sourceStateHash === sourceStateHash
      && previous?.channels?.left?.length
    ) {
      return previous;
    }

    const rendered = renderSonicVoiceSample(voice, {
      sampleRate,
      seed: stableSeed(`${seed}:${voice.id}`),
    });

    return {
      id: previous?.id ?? `sonic-asset-${voice.id}`,
      voiceId: voice.id,
      archetype: voice.archetype,
      name: voice.name ?? voice.archetype,
      sampleRate,
      durationSeconds: rendered.left.length / sampleRate,
      sourceStateHash,
      createdAt: new Date().toISOString(),
      channels: {
        left: Array.from(rendered.left),
        right: Array.from(rendered.right),
      },
    };
  });
}

function stableSeed(input) {
  const text = String(input);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

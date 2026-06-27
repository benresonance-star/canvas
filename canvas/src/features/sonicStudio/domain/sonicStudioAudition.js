import {
  renderPercussionEvent,
  renderTemporalChain,
} from '../../../../packages/sonic-core/src/index.js';

const DEFAULT_SAMPLE_RATE = 48000;

export function renderSonicStudioVoicePreview({
  voice,
  engineState = {},
  sampleRate = DEFAULT_SAMPLE_RATE,
  seed = 1,
  velocity = 0.86,
} = {}) {
  if (!voice) {
    return {
      sampleRate,
      durationSeconds: 0,
      buffer: [new Float32Array(0), new Float32Array(0)],
    };
  }
  const durationSeconds = previewDurationForVoice(voice);
  const rendered = renderPercussionEvent({
    voice,
    archetype: voice.archetype,
    event: {
      velocity,
      randomSeed: seed,
      microVariation: false,
    },
    sampleRate,
    durationSeconds,
    seed,
    microVariation: false,
  });
  const temporal = engineState.temporal?.enabled
    ? renderTemporalChain(rendered.buffer, engineState.temporal)
    : rendered.buffer;
  return {
    sampleRate,
    durationSeconds,
    buffer: temporal,
  };
}

export function analyzePreviewBuffer(buffer = []) {
  let peak = 0;
  let sumSquares = 0;
  let count = 0;
  for (const channel of buffer) {
    for (const sample of channel ?? []) {
      const value = Number.isFinite(sample) ? sample : 0;
      peak = Math.max(peak, Math.abs(value));
      sumSquares += value * value;
      count += 1;
    }
  }
  return {
    peak,
    rms: count > 0 ? Math.sqrt(sumSquares / count) : 0,
    nonSilent: peak > 0.0001,
  };
}

function previewDurationForVoice(voice) {
  const archetype = voice.archetype;
  if (archetype === 'kick') return 0.9;
  if (archetype === 'snare') return 0.8;
  if (archetype === 'hat') return 0.45;
  if (archetype === 'cymbal') return 1.6;
  return 1;
}

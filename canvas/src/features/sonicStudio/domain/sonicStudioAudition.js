import {
  renderSonicVoiceSample,
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
  const rendered = renderSonicVoiceSample(voice, {
    sampleRate,
    seed,
    velocity,
  });
  const buffer = [rendered.left, rendered.right];
  const temporal = engineState.temporal?.enabled
    ? renderTemporalChain(buffer, engineState.temporal)
    : buffer;
  return {
    sampleRate,
    durationSeconds: rendered.left.length / sampleRate,
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

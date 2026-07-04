/**
 * Offline buffer analysis for Vitest — detects clicks, clipping, and silence.
 */
export function analyzeAudioArtifacts(channels = [], {
  clipThreshold = 0.98,
  clickDeltaThreshold = 0.15,
  silenceThreshold = 0.0001,
} = {}) {
  let peak = 0;
  let sumSquares = 0;
  let count = 0;
  let clipCount = 0;
  let clickCount = 0;
  let maxDelta = 0;

  for (const channel of channels) {
    if (!channel?.length) continue;
    for (let index = 0; index < channel.length; index += 1) {
      const value = Number.isFinite(channel[index]) ? channel[index] : 0;
      const abs = Math.abs(value);
      peak = Math.max(peak, abs);
      sumSquares += value * value;
      count += 1;
      if (abs >= clipThreshold) clipCount += 1;
      if (index > 0) {
        const delta = Math.abs(value - channel[index - 1]);
        maxDelta = Math.max(maxDelta, delta);
        if (delta >= clickDeltaThreshold) clickCount += 1;
      }
    }
  }

  const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
  return {
    peak,
    rms,
    maxDelta,
    clipCount,
    clickCount,
    nonSilent: peak > silenceThreshold,
    frameCount: count,
  };
}

export function sumAudioChannels(channels = []) {
  if (!channels.length) return [];
  const length = Math.max(...channels.map((channel) => channel?.length ?? 0));
  const sum = new Float32Array(length);
  for (const channel of channels) {
    if (!channel?.length) continue;
    for (let index = 0; index < channel.length; index += 1) {
      sum[index] += channel[index] ?? 0;
    }
  }
  return [sum];
}

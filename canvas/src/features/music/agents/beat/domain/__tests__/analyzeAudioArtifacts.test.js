import { describe, expect, it } from 'vitest';
import { analyzeAudioArtifacts, sumAudioChannels } from '../analyzeAudioArtifacts.js';

describe('analyzeAudioArtifacts', () => {
  it('detects silence in empty or near-zero buffers', () => {
    const result = analyzeAudioArtifacts([new Float32Array(64)]);
    expect(result.nonSilent).toBe(false);
    expect(result.peak).toBe(0);
    expect(result.rms).toBe(0);
    expect(result.frameCount).toBe(64);
  });

  it('detects clipping and large sample-to-sample deltas', () => {
    const channel = new Float32Array([0, 0.5, 0.99, -0.99, 0.2]);
    const result = analyzeAudioArtifacts([channel]);
    expect(result.nonSilent).toBe(true);
    expect(result.peak).toBeCloseTo(0.99);
    expect(result.clipCount).toBe(2);
    expect(result.clickCount).toBeGreaterThan(0);
    expect(result.maxDelta).toBeGreaterThan(0.15);
  });

  it('sums multiple channels for mixed analysis', () => {
    const left = new Float32Array([0.1, 0.2, 0.3]);
    const right = new Float32Array([0.1, 0.2, 0.3]);
    const mixed = sumAudioChannels([left, right]);
    const result = analyzeAudioArtifacts(mixed);
    expect(result.peak).toBeCloseTo(0.6);
    expect(result.nonSilent).toBe(true);
  });
});

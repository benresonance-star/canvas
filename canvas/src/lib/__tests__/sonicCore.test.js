import { describe, expect, it } from 'vitest';
import {
  AllPassFilter,
  BiquadFilter,
  FractionalDelayLine,
  OnePoleFilter,
  ParameterSmoother,
  RingModulator,
  SafetyLimiter,
  SeededRandom,
  analyzeAudioBlock,
  asymmetricSoftClip,
  createDefaultPercussionKit,
  createSonicArtifact,
  createMaterialModel,
  createModalModes,
  createSonicEngineState,
  createSonicSavePoint,
  createTemporalState,
  createPercussionPreset,
  createSonicVoiceState,
  createAudioBlock,
  beatPatternToPercussionEvents,
  beatTrackToSonicVoice,
  createPinkNoise,
  createWhiteNoise,
  deriveVoiceRootHz,
  getMaterialModalRatios,
  hashSonicSourceState,
  interpolateSonicVoice,
  projectVoiceToSonicSpace,
  renderBeatPatternWithSonicCore,
  renderDelay,
  renderFDNReverb,
  renderFreeze,
  renderShimmer,
  renderTemporalChain,
  renderNoiseBurst,
  renderOffline,
  renderPercussionBeat,
  renderPercussionEvent,
  renderSonicEvent,
  sanitizeSample,
  saturateSample,
  softClip,
} from '../../../packages/sonic-core/src/index.js';

describe('sonic-core DSP foundation', () => {
  it('creates and analyzes audio blocks', () => {
    const block = createAudioBlock({ channels: 2, frames: 4 });
    block[0][0] = 0.5;
    block[1][1] = -0.25;

    expect(analyzeAudioBlock(block)).toEqual(expect.objectContaining({
      channels: 2,
      frames: 4,
      peak: 0.5,
    }));
  });

  it('sanitizes non-finite and denormal samples', () => {
    expect(sanitizeSample(Number.NaN)).toBe(0);
    expect(sanitizeSample(Infinity)).toBe(0);
    expect(sanitizeSample(1e-30)).toBe(0);
    expect(sanitizeSample(0.2)).toBe(0.2);
  });

  it('smooths parameters toward targets', () => {
    const smoother = new ParameterSmoother({
      initialValue: 0,
      sampleRate: 10,
      timeSeconds: 0.3,
      mode: 'linear',
    });
    smoother.setTarget(1);

    const values = [smoother.next(), smoother.next(), smoother.next()];

    expect(values[0]).toBeGreaterThan(0);
    expect(values.at(-1)).toBeCloseTo(1);
  });

  it('generates deterministic seeded random sequences and noise', () => {
    const a = new SeededRandom(123);
    const b = new SeededRandom(123);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);

    const whiteA = createWhiteNoise(44);
    const whiteB = createWhiteNoise(44);
    expect([whiteA(), whiteA(), whiteA()]).toEqual([whiteB(), whiteB(), whiteB()]);

    const pink = createPinkNoise(5);
    expect(Number.isFinite(pink())).toBe(true);
  });

  it('renders deterministic noise bursts', () => {
    const first = [...renderNoiseBurst({ frames: 8, seed: 7, type: 'pink' })];
    const second = [...renderNoiseBurst({ frames: 8, seed: 7, type: 'pink' })];

    expect(first).toEqual(second);
    expect(Math.max(...first.map(Math.abs))).toBeGreaterThan(0);
  });

  it('reads fractional delay with interpolation and clamping', () => {
    const delay = new FractionalDelayLine(8);
    delay.write(0);
    delay.write(1);
    delay.write(0);
    delay.write(0);

    expect(Number.isFinite(delay.read(1.5))).toBe(true);
    expect(delay.read(100)).toBeGreaterThanOrEqual(-1);
  });

  it('keeps filters finite and directionally useful', () => {
    const lowpass = new OnePoleFilter({ type: 'lowpass', sampleRate: 48000, frequencyHz: 200 });
    const highpass = new OnePoleFilter({ type: 'highpass', sampleRate: 48000, frequencyHz: 200 });
    const lpFirst = lowpass.process(1);
    const hpFirst = highpass.process(1);

    expect(lpFirst).toBeGreaterThan(0);
    expect(hpFirst).toBeGreaterThan(lpFirst);

    const biquad = new BiquadFilter({ type: 'bandpass', sampleRate: 48000, frequencyHz: 1000, q: 1 });
    for (let index = 0; index < 32; index += 1) {
      expect(Number.isFinite(biquad.process(index === 0 ? 1 : 0))).toBe(true);
    }
  });

  it('processes all-pass, saturation, and ring modulation without unsafe samples', () => {
    const allpass = new AllPassFilter({ delaySamples: 4, feedback: 0.6 });
    const ring = new RingModulator({ sampleRate: 48000, frequencyHz: 30, amount: 0.25, seed: 9 });

    for (let index = 0; index < 32; index += 1) {
      const diffused = allpass.process(index === 0 ? 1 : 0);
      expect(Number.isFinite(diffused)).toBe(true);
      expect(Number.isFinite(ring.process(diffused))).toBe(true);
    }

    expect(Math.abs(softClip(10, 2))).toBeLessThanOrEqual(1);
    expect(Number.isFinite(asymmetricSoftClip(0.5, { drive: 2, bias: 0.2 }))).toBe(true);
    expect(Number.isFinite(saturateSample(0.5, { mode: 'transformer', drive: 2 }))).toBe(true);
  });

  it('limits output below the ceiling', () => {
    const limiter = new SafetyLimiter({ sampleRate: 48000, ceilingDb: -1 });
    for (let index = 0; index < 256; index += 1) {
      expect(Math.abs(limiter.process(4))).toBeLessThanOrEqual(10 ** (-1 / 20));
    }
  });

  it('renders deterministic offline output with finite stats', () => {
    const render = () => renderOffline({
      sampleRate: 1000,
      durationSeconds: 0.02,
      blockSize: 8,
      seed: 22,
      renderBlock(block, { frame, sampleRate, random }) {
        for (let index = 0; index < block[0].length; index += 1) {
          const value = frame + index === 0
            ? 1
            : Math.sin((frame + index) * 2 * Math.PI * 40 / sampleRate) * 0.1 + random.bipolar() * 0.01;
          block[0][index] = value;
          block[1][index] = value;
        }
      },
    });

    const first = render();
    const second = render();

    expect(first.frames).toBe(20);
    expect(first.stats.peak).toBeGreaterThan(0);
    expect(first.stats.peak).toBeLessThanOrEqual(1);
    expect(first.buffer[0]).toEqual(second.buffer[0]);
    expect(Number.isFinite(first.stats.rms)).toBe(true);
  });

  it('normalizes voice models and exposes material modal ratios', () => {
    const material = createMaterialModel({ type: 'glass', hardness: 2, damping: -1 });
    const voice = createSonicVoiceState({ material, body: { type: 'plate' } });

    expect(material.type).toBe('glass');
    expect(material.hardness).toBe(1);
    expect(material.damping).toBe(0);
    expect(voice.body.type).toBe('plate');
    expect(getMaterialModalRatios('bronze')[0]).toBe(1);
  });

  it('maps material and body state into modal modes', () => {
    const skinModes = createModalModes({
      rootHz: 100,
      material: { type: 'skin', inharmonicity: 0.2, damping: 0.4 },
      body: { resonance: 0.5, damping: 0.4 },
    });
    const glassModes = createModalModes({
      rootHz: 100,
      material: { type: 'glass', inharmonicity: 0.9, damping: 0.1 },
      body: { resonance: 0.8, damping: 0.1 },
    });

    expect(skinModes).toHaveLength(6);
    expect(glassModes[1].frequencyHz).not.toBeCloseTo(skinModes[1].frequencyHz);
    expect(glassModes[0].decaySeconds).toBeGreaterThan(skinModes[0].decaySeconds);
  });

  it('renders deterministic one-shot sonic events', () => {
    const voice = createPercussionPreset('snare');
    const first = renderSonicEvent({
      voice,
      sampleRate: 4000,
      durationSeconds: 0.08,
      seed: 11,
      event: { velocity: 0.8, randomSeed: 99 },
    });
    const second = renderSonicEvent({
      voice,
      sampleRate: 4000,
      durationSeconds: 0.08,
      seed: 11,
      event: { velocity: 0.8, randomSeed: 99 },
    });

    expect(first.buffer[0]).toEqual(second.buffer[0]);
    expect(analyzeAudioBlock(first.buffer).peak).toBeGreaterThan(0);
    expect(analyzeAudioBlock(first.buffer).peak).toBeLessThanOrEqual(10 ** (-1 / 20));
  });

  it('makes contact and material changes audible in rendered stats', () => {
    const softSkin = createPercussionPreset('snare', {
      material: { type: 'skin', hardness: 0.2, brightness: 0.2, inharmonicity: 0.1 },
      contact: { hardness: 0.2, contactDurationMs: 18 },
    });
    const hardBronze = createPercussionPreset('snare', {
      material: { type: 'bronze', hardness: 0.9, brightness: 0.9, inharmonicity: 0.9 },
      contact: { hardness: 0.9, contactDurationMs: 3 },
    });
    const soft = renderSonicEvent({ voice: softSkin, sampleRate: 4000, durationSeconds: 0.08, seed: 3 });
    const hard = renderSonicEvent({ voice: hardBronze, sampleRate: 4000, durationSeconds: 0.08, seed: 3 });

    expect(analyzeAudioBlock(soft.buffer).rms).not.toBeCloseTo(analyzeAudioBlock(hard.buffer).rms);
    expect(deriveVoiceRootHz(softSkin)).not.toBeCloseTo(deriveVoiceRootHz(hardBronze));
  });

  it('renders distinct deterministic percussion archetypes through one kernel', () => {
    const kit = createDefaultPercussionKit();
    const renders = ['kick', 'snare', 'hat', 'cymbal'].map((archetype) => renderPercussionEvent({
      voice: kit[archetype],
      archetype,
      sampleRate: 4000,
      durationSeconds: 0.08,
      seed: 42,
      event: { randomSeed: 42, velocity: 0.8 },
      microVariation: false,
    }));
    const peaks = renders.map((render) => analyzeAudioBlock(render.buffer).peak);
    const rms = renders.map((render) => analyzeAudioBlock(render.buffer).rms.toFixed(5));

    expect(peaks.every((peak) => peak > 0 && peak <= 10 ** (-1 / 20))).toBe(true);
    expect(new Set(rms).size).toBeGreaterThan(2);
    expect(renders[0].buffer[0]).toEqual(renderPercussionEvent({
      voice: kit.kick,
      archetype: 'kick',
      sampleRate: 4000,
      durationSeconds: 0.08,
      seed: 42,
      event: { randomSeed: 42, velocity: 0.8 },
      microVariation: false,
    }).buffer[0]);
  });

  it('supports seeded micro-variation and deterministic beat rendering', () => {
    const kit = createDefaultPercussionKit();
    const variedA = renderPercussionEvent({
      voice: kit.hat,
      archetype: 'hat',
      sampleRate: 4000,
      durationSeconds: 0.08,
      seed: 1,
      event: { randomSeed: 1, velocity: 0.65 },
    });
    const variedB = renderPercussionEvent({
      voice: kit.hat,
      archetype: 'hat',
      sampleRate: 4000,
      durationSeconds: 0.08,
      seed: 2,
      event: { randomSeed: 2, velocity: 0.65 },
    });
    expect(variedA.buffer[0]).not.toEqual(variedB.buffer[0]);

    const beat = renderPercussionBeat({
      kit,
      sampleRate: 4000,
      tempoBpm: 120,
      bars: 1,
      seed: 5,
      events: [
        { voiceId: 'kick', timeBeats: 0, velocity: 0.9, randomSeed: 1 },
        { voiceId: 'snare', timeBeats: 1, velocity: 0.75, randomSeed: 2 },
        { voiceId: 'hat', timeBeats: 0.5, velocity: 0.55, randomSeed: 3 },
        { voiceId: 'cymbal', timeBeats: 2, velocity: 0.65, randomSeed: 4 },
      ],
    });
    const beatAgain = renderPercussionBeat({
      kit,
      sampleRate: 4000,
      tempoBpm: 120,
      bars: 1,
      seed: 5,
      events: [
        { voiceId: 'kick', timeBeats: 0, velocity: 0.9, randomSeed: 1 },
        { voiceId: 'snare', timeBeats: 1, velocity: 0.75, randomSeed: 2 },
        { voiceId: 'hat', timeBeats: 0.5, velocity: 0.55, randomSeed: 3 },
        { voiceId: 'cymbal', timeBeats: 2, velocity: 0.65, randomSeed: 4 },
      ],
    });

    expect(beat.buffer[0]).toEqual(beatAgain.buffer[0]);
    expect(beat.stats.peak).toBeGreaterThan(0);
    expect(beat.stats.peak).toBeLessThanOrEqual(10 ** (-1 / 20));
  });

  it('renders deterministic temporal delay, FDN, shimmer, freeze, and chains safely', () => {
    const dry = renderPercussionEvent({
      voice: createPercussionPreset('cymbal'),
      sampleRate: 4000,
      durationSeconds: 0.12,
      seed: 12,
      event: { randomSeed: 12, velocity: 0.7 },
      microVariation: false,
    }).buffer;
    const renders = [
      renderDelay(dry, { sampleRate: 4000, delayMs: 20, feedback: 0.7, wet: 0.4 }),
      renderFDNReverb(dry, { sampleRate: 4000, feedback: 0.92, wet: 0.45 }),
      renderShimmer(dry, { sampleRate: 4000, feedback: 0.82, wet: 0.35, pitchRatio: 2 }),
      renderFreeze(dry, { sampleRate: 4000, wet: 0.5 }),
      renderTemporalChain(dry, createTemporalState({
        delay: { wet: 0.25, feedback: 0.4 },
        fdnReverb: { enabled: true, wet: 0.2, feedback: 0.7 },
        shimmer: { enabled: true, wet: 0.15 },
        freeze: { enabled: true, wet: 0.1 },
        resonator: { enabled: true, amount: 0.1 },
      }), { sampleRate: 4000 }),
    ];

    for (const buffer of renders) {
      const stats = analyzeAudioBlock(buffer);
      expect(stats.peak).toBeGreaterThan(0);
      expect(stats.peak).toBeLessThanOrEqual(10 ** (-1 / 20));
      expect(Number.isFinite(stats.rms)).toBe(true);
    }
    expect(renderShimmer(dry, { sampleRate: 4000, feedback: 0.82, wet: 0.35 })[0]).toEqual(
      renderShimmer(dry, { sampleRate: 4000, feedback: 0.82, wet: 0.35 })[0],
    );
  });

  it('maps Beat Agent tracks and patterns into Sonic Core render inputs', () => {
    const track = {
      id: 'kick',
      role: 'kick',
      name: 'Kick',
      synth: { gain: 1.2, tone: 0.8, decayMs: 320, pitch: 5, distortion: 0.4 },
      steps: [{ active: true, velocity: 0.9 }, { active: false }],
    };
    const voice = beatTrackToSonicVoice(track);
    const pattern = { stepCount: 2, tracks: [track] };
    const events = beatPatternToPercussionEvents(pattern, { bpm: 120 });
    const render = renderBeatPatternWithSonicCore({ pattern, transport: { bpm: 120 }, sampleRate: 4000 });

    expect(voice.archetype).toBe('kick');
    expect(voice.output.gain).toBe(1.2);
    expect(voice.richness.saturation).toBe(0.4);
    expect(events).toHaveLength(1);
    expect(render.stats.peak).toBeGreaterThan(0);
  });

  it('creates Sonic Studio artifacts, hashes source state, and morphs save points safely', () => {
    const kick = createPercussionPreset('kick');
    const cymbal = createPercussionPreset('cymbal');
    const engineState = createSonicEngineState({ voices: [kick], temporal: { shimmer: { enabled: true } } });
    const artifact = createSonicArtifact({ id: 'sonic-1', projectId: 'project-1', engineState });
    const savePoint = createSonicSavePoint({ id: 'save-1', voice: kick, tags: ['kick'] });
    const morphed = interpolateSonicVoice(kick, cymbal, 0.5);
    const hashA = hashSonicSourceState(artifact.engineState);
    const hashB = hashSonicSourceState({ ...artifact.engineState, tempoBpm: 121 });

    expect(artifact.type).toBe('sonic_studio');
    expect(savePoint.fullState.archetype).toBe('kick');
    expect(projectVoiceToSonicSpace(kick).x).toBeGreaterThanOrEqual(-1);
    expect(morphed.body.size).toBeGreaterThan(Math.min(kick.body.size, cymbal.body.size) - 0.001);
    expect(hashA).not.toBe(hashB);
  });
});

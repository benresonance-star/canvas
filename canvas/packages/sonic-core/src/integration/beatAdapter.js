import { analyzeAudioBlock } from '../audio/AudioBlock.js';
import { createPercussionPreset } from '../percussion/percussionPresets.js';
import { renderPercussionBeat, renderPercussionEvent } from '../percussion/percussionKernel.js';
import { clamp } from '../dsp/sanitizeSample.js';

export function beatTrackToSonicVoice(track = {}, role = track.role ?? track.id ?? 'snare') {
  const archetype = roleToArchetype(role);
  const synth = normalizeSynth(track.synth);
  return createPercussionPreset(archetype, {
    id: track.id ?? `voice-${archetype}`,
    name: track.name ?? archetype,
    material: {
      brightness: clamp(0.22 + synth.tone * 0.74),
      hardness: clamp(0.2 + synth.tone * 0.72),
      nonlinearity: clamp(synth.distortion),
    },
    body: {
      damping: clamp(1 - synth.decayMs / 900),
      resonance: clamp(0.22 + synth.decayMs / 900),
      tension: clamp(0.35 + synth.pitch / 48),
    },
    contact: {
      hardness: clamp(0.25 + synth.tone * 0.7),
      contactDurationMs: clamp(18 - synth.attackMs * 0.18, 1, 30),
    },
    resonator: {
      outputGain: clamp(synth.gain, 0, 1.5),
    },
    richness: {
      saturation: clamp(synth.distortion),
      noise: role === 'hat' ? 0.2 : 0.1,
      drift: 0.02,
    },
    output: {
      gain: clamp(synth.gain, 0, 1.5),
      pan: clamp(track.pan ?? 0, -1, 1),
    },
  });
}

export function beatPatternToPercussionEvents(pattern = {}, transport = {}) {
  const stepCount = Math.max(1, Math.floor(Number(pattern.stepCount) || 16));
  const stepsPerBeat = 4;
  const events = [];
  for (const track of pattern.tracks ?? []) {
    if (track.muted) continue;
    for (let index = 0; index < stepCount; index += 1) {
      const step = track.steps?.[index];
      if (!step?.active) continue;
      events.push({
        voiceId: track.id,
        archetype: roleToArchetype(track.role ?? track.id),
        timeBeats: index / stepsPerBeat,
        velocity: step.velocity ?? 0.8,
        randomSeed: stableSeed(`${track.id}:${index}:${transport.bpm ?? 120}`),
        microVariation: false,
      });
    }
  }
  return events;
}

export function renderBeatTrackSample(track, {
  sampleRate = 48000,
  durationSeconds,
  seed,
} = {}) {
  const synth = normalizeSynth(track?.synth);
  const voice = beatTrackToSonicVoice(track, track?.role ?? track?.id);
  const render = renderPercussionEvent({
    voice,
    archetype: roleToArchetype(track?.role ?? track?.id),
    sampleRate,
    durationSeconds: durationSeconds ?? Math.max(0.12, synth.decayMs / 1000 + 0.12),
    seed: seed ?? stableSeed(track?.id ?? track?.role ?? 'beat-track'),
    event: { velocity: 1, randomSeed: seed ?? stableSeed(track?.id ?? track?.role ?? 'beat-track') },
    microVariation: false,
  });
  return {
    id: track?.id ?? track?.role ?? 'track',
    role: track?.role ?? track?.id ?? 'snare',
    sampleRate,
    left: render.buffer[0],
    right: render.buffer[1] ?? render.buffer[0],
    stats: analyzeAudioBlock(render.buffer),
  };
}

export function createBeatSonicSampleMap(pattern = {}, { sampleRate = 48000, seed = 1 } = {}) {
  const samples = {};
  for (const track of pattern.tracks ?? []) {
    const rendered = renderBeatTrackSample(track, {
      sampleRate,
      seed: stableSeed(`${seed}:${track.id}:${JSON.stringify(track.synth ?? {})}`),
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

export function renderBeatPatternWithSonicCore({
  pattern,
  transport = {},
  sampleRate = 48000,
  seed = 1,
} = {}) {
  const kit = {};
  for (const track of pattern?.tracks ?? []) kit[track.id] = beatTrackToSonicVoice(track, track.role ?? track.id);
  return renderPercussionBeat({
    kit,
    events: beatPatternToPercussionEvents(pattern, transport),
    tempoBpm: transport.bpm ?? 120,
    bars: Math.max(1, Math.ceil((pattern?.stepCount ?? 16) / 16)),
    sampleRate,
    seed,
  });
}

export function roleToArchetype(role = 'snare') {
  if (role === 'kick') return 'kick';
  if (role === 'hat' || role === 'hat-closed') return 'hat';
  if (role === 'cymbal' || role === 'ride') return 'cymbal';
  return 'snare';
}

function normalizeSynth(synth = {}) {
  return {
    gain: clamp(synth.gain ?? 1, 0, 1.5),
    attackMs: clamp(synth.attackMs ?? 1, 0, 80),
    decayMs: clamp(synth.decayMs ?? 180, 20, 800),
    pitch: clamp(synth.pitch ?? 0, -24, 24),
    tone: clamp(synth.tone ?? 0.5),
    distortion: clamp(synth.distortion ?? 0),
  };
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

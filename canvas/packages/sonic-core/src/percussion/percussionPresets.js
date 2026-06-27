import { createSonicVoiceState } from '../types/models.js';

export const PERCUSSION_ARCHETYPES = ['kick', 'snare', 'hat', 'cymbal'];

export function createPercussionPreset(archetype = 'kick', overrides = {}) {
  const preset = {
    kick: {
      id: 'voice-kick',
      name: 'Deep Felt Kick',
      archetype: 'kick',
      body: { type: 'membrane', size: 0.82, mass: 0.78, stiffness: 0.28, tension: 0.34, damping: 0.42, resonance: 0.76, modeDensity: 0.32 },
      material: { type: 'skin', hardness: 0.25, brightness: 0.22, damping: 0.44, inharmonicity: 0.16, roughness: 0.12, nonlinearity: 0.18 },
      contact: { type: 'felt_beater', hardness: 0.22, contactArea: 0.52, friction: 0.04, bounce: 0.04, contactDurationMs: 15, damping: 0.18 },
      gesture: { type: 'hit', velocity: 0.9, pressure: 0.45, durationMs: 180, angle: 0.5, speed: 0.65, repetition: 0 },
      position: { x: 0, y: 0, radius: 0.12 },
      exciter: { type: 'sine_ping' },
      resonator: { type: 'modal', modeCount: 5, outputGain: 1.2 },
      richness: { saturation: 0.12, noise: 0.04, drift: 0.02 },
      output: { gain: 1.1, pan: 0 },
    },
    snare: {
      id: 'voice-snare',
      name: 'Dry Stick Snare',
      archetype: 'snare',
      body: { type: 'shell', size: 0.48, mass: 0.44, stiffness: 0.58, tension: 0.62, damping: 0.38, resonance: 0.58, modeDensity: 0.62 },
      material: { type: 'wood', hardness: 0.58, brightness: 0.48, damping: 0.35, inharmonicity: 0.32, roughness: 0.46, nonlinearity: 0.12 },
      contact: { type: 'stick', hardness: 0.78, contactArea: 0.18, friction: 0.18, bounce: 0.15, contactDurationMs: 5, damping: 0.12 },
      gesture: { type: 'hit', velocity: 0.78, pressure: 0.3, durationMs: 120, angle: 0.45, speed: 0.75, repetition: 0.08 },
      position: { x: 0.25, y: -0.1, radius: 0.46 },
      exciter: { type: 'stick_transient' },
      resonator: { type: 'modal', modeCount: 7, outputGain: 0.85 },
      richness: { saturation: 0.09, noise: 0.28, drift: 0.03 },
      output: { gain: 0.9, pan: -0.05 },
    },
    hat: {
      id: 'voice-hat',
      name: 'Closed Bronze Hat',
      archetype: 'hat',
      body: { type: 'plate', size: 0.25, mass: 0.24, stiffness: 0.78, tension: 0.3, damping: 0.68, resonance: 0.42, modeDensity: 0.88 },
      material: { type: 'bronze', hardness: 0.82, brightness: 0.86, damping: 0.28, inharmonicity: 0.82, roughness: 0.42, nonlinearity: 0.08 },
      contact: { type: 'stick', hardness: 0.86, contactArea: 0.12, friction: 0.24, bounce: 0.1, contactDurationMs: 3, damping: 0.3 },
      gesture: { type: 'tap', velocity: 0.62, pressure: 0.2, durationMs: 70, angle: 0.65, speed: 0.82, repetition: 0.02 },
      position: { x: -0.45, y: 0.2, radius: 0.72 },
      exciter: { type: 'filtered_noise' },
      resonator: { type: 'modal', modeCount: 8, outputGain: 0.62 },
      richness: { saturation: 0.04, noise: 0.18, drift: 0.04 },
      output: { gain: 0.62, pan: 0.18 },
    },
    cymbal: {
      id: 'voice-cymbal',
      name: 'Metallic Bloom Cymbal',
      archetype: 'cymbal',
      body: { type: 'plate', size: 0.64, mass: 0.38, stiffness: 0.72, tension: 0.22, damping: 0.22, resonance: 0.82, modeDensity: 0.94 },
      material: { type: 'bronze', hardness: 0.72, brightness: 0.82, damping: 0.18, inharmonicity: 0.9, roughness: 0.36, nonlinearity: 0.1 },
      contact: { type: 'mallet', hardness: 0.48, contactArea: 0.34, friction: 0.12, bounce: 0.04, contactDurationMs: 10, damping: 0.08 },
      gesture: { type: 'hit', velocity: 0.72, pressure: 0.28, durationMs: 900, angle: 0.55, speed: 0.58, repetition: 0 },
      position: { x: 0.52, y: 0.12, radius: 0.68 },
      exciter: { type: 'noise_burst' },
      resonator: { type: 'modal', modeCount: 10, outputGain: 0.72 },
      richness: { saturation: 0.05, noise: 0.2, drift: 0.05 },
      output: { gain: 0.78, pan: 0.24 },
    },
  }[archetype] ?? {};
  return createSonicVoiceState(deepMerge(preset, overrides));
}

export function createDefaultPercussionKit(overrides = {}) {
  return {
    kick: createPercussionPreset('kick', overrides.kick),
    snare: createPercussionPreset('snare', overrides.snare),
    hat: createPercussionPreset('hat', overrides.hat),
    cymbal: createPercussionPreset('cymbal', overrides.cymbal),
  };
}

function deepMerge(base = {}, patch = {}) {
  const output = { ...base };
  for (const [key, value] of Object.entries(patch ?? {})) {
    output[key] = isPlainObject(value) && isPlainObject(output[key])
      ? deepMerge(output[key], value)
      : value;
  }
  return output;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

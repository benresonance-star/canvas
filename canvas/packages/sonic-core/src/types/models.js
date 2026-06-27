import { clamp } from '../dsp/sanitizeSample.js';

export const BODY_TYPES = ['membrane', 'shell', 'plate', 'bar', 'cavity', 'string', 'hybrid'];
export const MATERIAL_TYPES = [
  'skin',
  'wood',
  'steel',
  'brass',
  'bronze',
  'glass',
  'ceramic',
  'plastic',
  'stone',
  'concrete',
  'bamboo',
  'carbon',
  'synthetic',
];
export const CONTACT_TYPES = [
  'stick',
  'rod',
  'brush',
  'palm',
  'finger',
  'nail',
  'knuckle',
  'mallet',
  'felt_beater',
  'rubber_beater',
  'coin',
  'scraper',
  'bow',
];
export const GESTURE_TYPES = ['hit', 'tap', 'slap', 'roll', 'brush', 'scrape', 'rub', 'press', 'bounce', 'mute', 'bow'];

export function createBodyModel(overrides = {}) {
  return {
    type: normalizeEnum(overrides.type, BODY_TYPES, 'membrane'),
    size: clamp(overrides.size ?? 0.5),
    mass: clamp(overrides.mass ?? 0.5),
    stiffness: clamp(overrides.stiffness ?? 0.5),
    tension: clamp(overrides.tension ?? 0.5),
    damping: clamp(overrides.damping ?? 0.35),
    resonance: clamp(overrides.resonance ?? 0.6),
    modeDensity: clamp(overrides.modeDensity ?? 0.45),
  };
}

export function createMaterialModel(overrides = {}) {
  return {
    type: normalizeEnum(overrides.type, MATERIAL_TYPES, 'skin'),
    hardness: clamp(overrides.hardness ?? 0.45),
    brightness: clamp(overrides.brightness ?? 0.45),
    damping: clamp(overrides.damping ?? 0.35),
    inharmonicity: clamp(overrides.inharmonicity ?? 0.3),
    roughness: clamp(overrides.roughness ?? 0.25),
    nonlinearity: clamp(overrides.nonlinearity ?? 0.15),
  };
}

export function createContactModel(overrides = {}) {
  return {
    type: normalizeEnum(overrides.type, CONTACT_TYPES, 'stick'),
    hardness: clamp(overrides.hardness ?? 0.65),
    contactArea: clamp(overrides.contactArea ?? 0.25),
    friction: clamp(overrides.friction ?? 0.1),
    bounce: clamp(overrides.bounce ?? 0.05),
    contactDurationMs: clamp(overrides.contactDurationMs ?? 8, 0.1, 400),
    damping: clamp(overrides.damping ?? 0.2),
  };
}

export function createGestureModel(overrides = {}) {
  return {
    type: normalizeEnum(overrides.type, GESTURE_TYPES, 'hit'),
    velocity: clamp(overrides.velocity ?? 0.8),
    pressure: clamp(overrides.pressure ?? 0.3),
    durationMs: clamp(overrides.durationMs ?? 120, 1, 10000),
    angle: clamp(overrides.angle ?? 0.5),
    speed: clamp(overrides.speed ?? 0.6),
    repetition: clamp(overrides.repetition ?? 0.1),
  };
}

export function createPositionModel(overrides = {}) {
  return {
    x: clamp(overrides.x ?? 0, -1, 1),
    y: clamp(overrides.y ?? 0, -1, 1),
    radius: clamp(overrides.radius ?? 0.2),
    ...(overrides.path ? { path: overrides.path } : {}),
  };
}

export function createSonicVoiceState(overrides = {}) {
  return {
    id: overrides.id ?? 'voice-default',
    name: overrides.name ?? 'Sonic Voice',
    archetype: overrides.archetype ?? 'hybrid',
    body: createBodyModel(overrides.body),
    material: createMaterialModel(overrides.material),
    contact: createContactModel(overrides.contact),
    gesture: createGestureModel(overrides.gesture),
    position: createPositionModel(overrides.position),
    exciter: overrides.exciter ?? { type: 'stick_transient' },
    resonator: overrides.resonator ?? { type: 'modal' },
    richness: overrides.richness ?? { saturation: 0.08, noise: 0.08, drift: 0.02 },
    temporal: overrides.temporal ?? { enabled: false },
    environment: overrides.environment ?? { roomSize: 0.2, stereoWidth: 0.3, airAbsorption: 0.35 },
    output: overrides.output ?? { gain: 0.9, pan: 0 },
  };
}

function normalizeEnum(value, values, fallback) {
  return values.includes(value) ? value : fallback;
}

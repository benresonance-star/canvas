export const SPACE_ROOM_IDENTITIES = ['studio', 'chamber', 'hall', 'plate', 'void'];

export function createDefaultSpaceState(overrides) {
  const source = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    schemaVersion: 1,
    roomIdentity: source.roomIdentity ?? 'studio',
    roomSize: Number.isFinite(source.roomSize) ? source.roomSize : 0.35,
    width: Number.isFinite(source.width) ? source.width : 0.55,
    diffusion: Number.isFinite(source.diffusion) ? source.diffusion : 0.3,
    damping: Number.isFinite(source.damping) ? source.damping : 0.45,
    sendMatrix: source.sendMatrix ?? {
      beat: 0.12,
      bass: 0.08,
      pad: 0.35,
      lead: 0.22,
      voice: 0.18,
      fx: 0.4,
    },
    positions: source.positions ?? {},
    automation: Array.isArray(source.automation) ? source.automation : [],
    updatedAt: source.updatedAt ?? new Date().toISOString(),
  };
}

export function deriveSpaceFromDescriptors(spaceState, descriptorGraph) {
  const state = createDefaultSpaceState(spaceState);
  const descriptors = descriptorGraph?.descriptors ?? {};
  const space = descriptors.Space?.value ?? 0.5;
  const intimacy = descriptors.Intimacy?.value ?? 0.5;
  const dreaminess = descriptors.Dreaminess?.value ?? 0.5;
  const brightness = descriptors.Brightness?.value ?? 0.5;
  return {
    ...state,
    roomSize: clamp(space * 0.75 + dreaminess * 0.25),
    width: clamp(space * 0.55 + (1 - intimacy) * 0.35 + dreaminess * 0.1),
    diffusion: clamp(dreaminess * 0.65 + space * 0.25 + state.diffusion * 0.1),
    damping: clamp(1 - brightness * 0.65),
    updatedAt: new Date().toISOString(),
  };
}

const ROOM_FDN_PRESETS = {
  studio: {
    size: 0.26,
    feedback: 0.5,
    wet: 0.14,
    damping: 0.5,
    width: 0.4,
    delayScale: 0.68,
    sendGain: 2.0,
    inputDiffusion: 0.3,
    predelayMs: 6,
    modDepth: 0.02,
  },
  chamber: {
    size: 0.62,
    feedback: 0.7,
    wet: 0.2,
    damping: 0.58,
    width: 0.76,
    delayScale: 1.12,
    sendGain: 2.6,
    inputDiffusion: 0.42,
    predelayMs: 22,
    modDepth: 0.08,
  },
  hall: {
    size: 0.9,
    feedback: 0.8,
    wet: 0.26,
    damping: 0.42,
    width: 0.9,
    delayScale: 1.55,
    sendGain: 2.9,
    inputDiffusion: 0.58,
    predelayMs: 38,
    modDepth: 0.14,
  },
  plate: {
    size: 0.14,
    feedback: 0.86,
    wet: 0.24,
    damping: 0.16,
    width: 0.34,
    delayScale: 0.46,
    sendGain: 3.2,
    inputDiffusion: 0.88,
    predelayMs: 2,
    modDepth: 0,
  },
  void: {
    size: 0,
    feedback: 0,
    wet: 0,
    damping: 0.5,
    width: 0.5,
    delayScale: 1,
    sendGain: 0,
    inputDiffusion: 0,
    predelayMs: 0,
    modDepth: 0,
  },
};

export const ROOM_SLIDER_ANCHORS = {
  studio: { roomSize: 0.32, width: 0.42, diffusion: 0.28, damping: 0.48 },
  chamber: { roomSize: 0.58, width: 0.74, diffusion: 0.48, damping: 0.55 },
  hall: { roomSize: 0.82, width: 0.88, diffusion: 0.55, damping: 0.4 },
  plate: { roomSize: 0.22, width: 0.36, diffusion: 0.72, damping: 0.2 },
  void: { roomSize: 0, width: 0.5, diffusion: 0.3, damping: 0.45 },
};

export function mapSpaceStateToFdnParams(spaceState) {
  const state = createDefaultSpaceState(spaceState);
  if (state.roomIdentity === 'void') {
    return {
      enabled: false,
      size: 0,
      feedback: 0,
      wet: 0,
      damping: 0.5,
      width: 0.5,
      delayScale: 1,
      sendGain: 0,
      inputDiffusion: 0,
      predelayMs: 0,
      modDepth: 0,
    };
  }
  const preset = ROOM_FDN_PRESETS[state.roomIdentity] ?? ROOM_FDN_PRESETS.studio;
  const beatSend = Number.isFinite(state.sendMatrix?.beat)
    ? state.sendMatrix.beat
    : 0.12;
  const roomSizeMod = (state.roomSize - (ROOM_SLIDER_ANCHORS[state.roomIdentity]?.roomSize ?? 0.35)) * 0.85;
  const diffusionMod = (state.diffusion - (ROOM_SLIDER_ANCHORS[state.roomIdentity]?.diffusion ?? 0.3)) * 0.4;
  const dampingMod = (state.damping - (ROOM_SLIDER_ANCHORS[state.roomIdentity]?.damping ?? 0.45)) * 0.5;
  const widthMod = (state.width - (ROOM_SLIDER_ANCHORS[state.roomIdentity]?.width ?? 0.55)) * 0.45;

  return {
    enabled: true,
    size: clamp(preset.size + roomSizeMod * 0.55, 0, 1),
    feedback: clamp(preset.feedback + diffusionMod, 0, 0.94),
    wet: clamp(preset.wet + roomSizeMod * 0.12 + beatSend * 0.18, 0, 0.55),
    damping: clamp(preset.damping + dampingMod, 0, 0.95),
    width: clamp(preset.width + widthMod, 0, 1),
    delayScale: preset.delayScale,
    sendGain: preset.sendGain,
    inputDiffusion: clamp(preset.inputDiffusion + diffusionMod * 0.25, 0, 1),
    predelayMs: preset.predelayMs,
    modDepth: preset.modDepth,
  };
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

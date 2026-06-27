export const SPACE_ROOM_IDENTITIES = ['studio', 'chamber', 'hall', 'plate', 'void'];

export function createDefaultSpaceState(overrides = {}) {
  return {
    schemaVersion: 1,
    roomIdentity: overrides.roomIdentity ?? 'studio',
    roomSize: Number.isFinite(overrides.roomSize) ? overrides.roomSize : 0.35,
    width: Number.isFinite(overrides.width) ? overrides.width : 0.55,
    diffusion: Number.isFinite(overrides.diffusion) ? overrides.diffusion : 0.3,
    damping: Number.isFinite(overrides.damping) ? overrides.damping : 0.45,
    sendMatrix: overrides.sendMatrix ?? {
      beat: 0.12,
      bass: 0.08,
      pad: 0.35,
      lead: 0.22,
      voice: 0.18,
      fx: 0.4,
    },
    positions: overrides.positions ?? {},
    automation: Array.isArray(overrides.automation) ? overrides.automation : [],
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
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

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

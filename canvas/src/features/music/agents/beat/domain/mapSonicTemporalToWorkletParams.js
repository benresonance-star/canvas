import { normalizeSonicTemporal } from '../../../../../../packages/music-core/src/index.js';

export function mapSonicTemporalToWorkletState(sonicTemporal = {}, routing = {}) {
  const state = normalizeSonicTemporal(sonicTemporal);
  const delayActive = state.delay.enabled;
  const shimmerActive = state.shimmer.enabled;
  const freezeActive = state.freeze.enabled || routing.freezeHold === true;

  let topology = 'digital';
  if (shimmerActive) topology = 'shimmer';
  else if (freezeActive) topology = 'freeze';
  else if (state.delay.mode === 'ping-pong') topology = 'ping-pong';

  const masterWet = Math.max(
    delayActive ? state.delay.wet : 0,
    shimmerActive ? state.shimmer.wet : 0,
    freezeActive ? state.freeze.wet : 0,
  );

  return {
    topology,
    freeze: freezeActive,
    pitchRatio: state.shimmer.pitchRatio,
    delayMs: state.delay.delayMs,
    feedback: delayActive
      ? state.delay.feedback
      : shimmerActive
        ? state.shimmer.feedback
        : state.freeze.feedback,
    wet: masterWet,
    diffusion: shimmerActive ? 0.55 : 0.12,
    damping: delayActive ? state.delay.damping : state.shimmer.damping,
    modRateHz: shimmerActive ? 0.35 : 0.2,
    modDepth: shimmerActive ? 0.22 : 0.08,
    drive: shimmerActive ? 0.08 : 0.05,
    width: 0.5,
  };
}

export function applyWorkletParams(node, params, context) {
  if (!node?.parameters || !context) return;
  const now = context.currentTime;
  for (const [name, value] of Object.entries(params)) {
    const param = node.parameters.get(name);
    if (!param) continue;
    const min = Number.isFinite(param.minValue) ? param.minValue : 0;
    const max = Number.isFinite(param.maxValue) ? param.maxValue : 1;
    const clamped = Math.max(min, Math.min(max, Number(value)));
    param.cancelScheduledValues(now);
    param.setTargetAtTime(clamped, now, 0.02);
  }
}

export const BEAT_AGENT_STEPS_PER_BAR = 16;

export function stepDurationSecondsForBpm(bpm, stepsPerBar = BEAT_AGENT_STEPS_PER_BAR) {
  const safeBpm = clampNumber(bpm, 30, 300, 120);
  return (60 / safeBpm) * (4 / stepsPerBar);
}

export function stepDurationFramesForBpm(bpm, sampleRate, stepsPerBar = BEAT_AGENT_STEPS_PER_BAR) {
  const safeSampleRate = clampNumber(sampleRate, 1, 384000, 48000);
  return stepDurationSecondsForBpm(bpm, stepsPerBar) * safeSampleRate;
}

export function beatPositionFromStep(step, stepsPerBar = BEAT_AGENT_STEPS_PER_BAR) {
  const safeStepsPerBar = Math.max(1, Math.floor(Number(stepsPerBar) || BEAT_AGENT_STEPS_PER_BAR));
  const safeStep = positiveModulo(Math.floor(Number(step) || 0), safeStepsPerBar);
  return {
    bar: Math.floor((Math.floor(Number(step) || 0)) / safeStepsPerBar) + 1,
    beat: Math.floor(safeStep / Math.max(1, safeStepsPerBar / 4)) + 1,
    tick: safeStep,
    step: safeStep,
  };
}

export function positiveModulo(value, divisor) {
  const safeDivisor = Math.max(1, Number(divisor) || 1);
  return ((value % safeDivisor) + safeDivisor) % safeDivisor;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

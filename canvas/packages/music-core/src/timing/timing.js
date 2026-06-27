import { DEFAULT_TICKS_PER_QUARTER } from '../transport/transportState.js';

export function beatsPerBar(timeSignature = { numerator: 4, denominator: 4 }) {
  return Math.max(1, Number(timeSignature.numerator) || 4);
}

export function secondsPerBeat(bpm) {
  return 60 / Math.max(1, Number(bpm) || 120);
}

export function ticksPerBar(timeSignature, ticksPerQuarter = DEFAULT_TICKS_PER_QUARTER) {
  const numerator = beatsPerBar(timeSignature);
  const denominator = Math.max(1, Number(timeSignature?.denominator) || 4);
  return numerator * ticksPerQuarter * (4 / denominator);
}

export function barBeatTickToTicks({ bar = 1, beat = 1, tick = 0 }, transport) {
  const perBar = ticksPerBar(transport.timeSignature, transport.ticksPerQuarter);
  const perBeat = transport.ticksPerQuarter * (4 / transport.timeSignature.denominator);
  return Math.max(0, (bar - 1) * perBar + (beat - 1) * perBeat + tick);
}

export function ticksToBarBeatTick(totalTicks, transport) {
  const perBar = ticksPerBar(transport.timeSignature, transport.ticksPerQuarter);
  const perBeat = transport.ticksPerQuarter * (4 / transport.timeSignature.denominator);
  const safeTicks = Math.max(0, Number(totalTicks) || 0);
  const bar = Math.floor(safeTicks / perBar) + 1;
  const inBar = safeTicks % perBar;
  const beat = Math.floor(inBar / perBeat) + 1;
  const tick = Math.floor(inBar % perBeat);
  return { bar, beat, tick };
}

export function stepDurationSeconds({ bpm, stepsPerBar = 16, timeSignature }) {
  const beats = beatsPerBar(timeSignature);
  return (secondsPerBeat(bpm) * beats) / Math.max(1, stepsPerBar);
}

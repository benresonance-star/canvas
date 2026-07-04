import { createDefaultBeatAudioRouting } from '../temporal/sonicTemporalDerivation.js';
import { createDefaultDescriptorGraph, driveDescriptorMappings } from './descriptorGraph.js';

export const NEUTRAL_BEAT_PERFORMANCE = Object.freeze({
  stepProbabilityBias: 0,
  velocitySpread: 0,
  masterGainBias: 0,
  densityPressure: 0,
  tapChance: 0,
  gainTrim: 0,
});

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(Number(value))) return min;
  return Math.max(min, Math.min(max, Number(value)));
}

function resolvedMappings(descriptorGraph, name) {
  const descriptor = descriptorGraph?.descriptors?.[name];
  if (!descriptor) return {};
  const driven = driveDescriptorMappings(descriptor, descriptor.value ?? 0.5);
  return {
    ...driven,
    ...(descriptor.mappings ?? {}),
  };
}

export function deriveBeatPerformanceFromDescriptors(
  descriptorGraph,
  { macroDepth = 0.65, bypass = false } = {},
) {
  if (bypass) return { ...NEUTRAL_BEAT_PERFORMANCE };

  const graph = createDefaultDescriptorGraph(descriptorGraph ?? {});
  const depth = clamp(macroDepth);
  const complexity = graph.descriptors.Complexity?.value ?? 0.5;
  const complexityMap = resolvedMappings(graph, 'Complexity');
  const energy = graph.descriptors.Energy?.value ?? 0.5;
  const energyMap = resolvedMappings(graph, 'Energy');
  const humanFeel = graph.descriptors['Human Feel']?.value ?? 0.5;
  const humanMap = resolvedMappings(graph, 'Human Feel');
  const pressure = graph.descriptors.Pressure?.value ?? 0.5;
  const pressureMap = resolvedMappings(graph, 'Pressure');
  const fragility = graph.descriptors.Fragility?.value ?? 0.5;
  const fragilityMap = resolvedMappings(graph, 'Fragility');

  const noteDensity = complexityMap.noteDensity ?? 0.55;
  const tapCount = complexityMap.tapCount ?? 0.35;

  return {
    stepProbabilityBias: clamp((complexity - 0.5) * noteDensity * 0.55 * depth, -0.35, 0.35),
    velocitySpread: clamp(humanFeel * (humanMap.velocitySpread ?? 0.18) * 0.65 * depth, 0, 0.45),
    masterGainBias: clamp((energy - 0.5) * (energyMap.gain ?? 0.25) * 1.1 * depth, -0.25, 0.25),
    densityPressure: clamp((pressure - 0.5) * (pressureMap.density ?? 0.46) * 0.55 * depth, -0.2, 0.2),
    tapChance: clamp(Math.max(0, complexity - 0.55) * tapCount * 0.28 * depth, 0, 0.22),
    gainTrim: clamp((fragility - 0.5) * (fragilityMap.gain ?? -0.18) * 0.35 * depth, -0.18, 0.05),
  };
}

export function resolveBeatDescriptorExecution({
  descriptorGraph,
  audioRouting,
} = {}) {
  const routing = createDefaultBeatAudioRouting(audioRouting);
  return deriveBeatPerformanceFromDescriptors(descriptorGraph, {
    macroDepth: routing.descriptorMacroDepth,
    bypass: routing.descriptorGraphBypass,
  });
}

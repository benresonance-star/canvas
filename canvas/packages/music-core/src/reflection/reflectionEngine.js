export function analyzeMusicClutter({ descriptorGraph, spaceState, temporalState, performerStates = [] } = {}) {
  const descriptors = descriptorGraph?.descriptors ?? {};
  const complexity = descriptors.Complexity?.value ?? 0.5;
  const pressure = descriptors.Pressure?.value ?? 0.5;
  const space = descriptors.Space?.value ?? 0.5;
  const persistence = descriptors.Persistence?.value ?? 0.5;
  const wetLoad = (spaceState?.roomSize ?? 0.35) * 0.35
    + (temporalState?.wet ?? 0.18) * 0.35
    + (temporalState?.feedback ?? 0.28) * 0.3;
  const performerLoad = performerStates.reduce((sum, performer) => sum + (performer?.density ?? 0), 0)
    / Math.max(1, performerStates.length || 1);
  const clutter = clamp(complexity * 0.32 + pressure * 0.24 + persistence * 0.14 + wetLoad * 0.18 + performerLoad * 0.12);
  const suggestions = [];
  if (clutter > 0.72) suggestions.push('Reduce delay feedback or performer density before adding another layer.');
  if (space > 0.7 && persistence > 0.7) suggestions.push('Long space and high persistence may blur the sketch; consider lowering one.');
  if (pressure > 0.75 && complexity > 0.65) suggestions.push('Pressure and complexity are both high; create a release moment.');
  return {
    clutter,
    risk: clutter > 0.72 ? 'high' : clutter > 0.48 ? 'medium' : 'low',
    suggestions,
  };
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

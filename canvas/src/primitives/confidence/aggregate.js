import { BAND_ORDER } from '../shared/types.js';

export function minBand(a, b) {
  return BAND_ORDER[a] <= BAND_ORDER[b] ? a : b;
}

export function aggregateConfidence(confidence) {
  const policy = confidence?.aggregate?.policy || 'strict_min';
  if (policy !== 'strict_min') {
    return confidence?.aggregate?.band || 'medium';
  }
  return minBand(
    confidence.epistemic.band,
    minBand(confidence.source.band, confidence.scope.band),
  );
}

export function withComputedAggregate(confidence) {
  const band = aggregateConfidence(confidence);
  return {
    ...confidence,
    aggregate: {
      ...confidence.aggregate,
      band,
      policy: confidence.aggregate?.policy || 'strict_min',
    },
  };
}

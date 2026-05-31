import { minBand } from '../confidence/aggregate.js';
import { withComputedAggregate } from '../confidence/aggregate.js';

export function deriveRelationshipConfidence(relType, fromConfidence, toConfidence) {
  if (!fromConfidence || !toConfidence) return null;
  const from = withComputedAggregate(fromConfidence);
  const to = withComputedAggregate(toConfidence);
  const fa = from.aggregate.band;
  const tb = to.aggregate.band;

  let band;
  switch (relType) {
    case 'refines':
      band = tb;
      break;
    case 'contradicts':
    case 'supports':
    case 'satisfies':
    case 'applies_to':
      band = minBand(fa, tb);
      break;
    default:
      return null;
  }

  return withComputedAggregate({
    version: 'confidence.v1',
    epistemic: { ...from.epistemic, band },
    source: { ...from.source, band: minBand(from.source.band, to.source.band) },
    scope: { ...from.scope, band: minBand(from.scope.band, to.scope.band) },
    aggregate: { band, policy: 'strict_min' },
    rationale: `derived from ${relType}`,
    factors: [],
    computed_at: new Date().toISOString(),
    computed_by: { kind: 'agent', id: 'derivation.v1' },
  });
}

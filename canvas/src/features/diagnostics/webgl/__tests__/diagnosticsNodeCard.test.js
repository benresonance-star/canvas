import { describe, expect, it } from 'vitest';
import {
  NODE_CARD_RADIUS,
  NODE_EXTRUDE_DEPTH,
  resolveNodeCardVisual,
} from '../diagnosticsNodeCard.js';

describe('diagnosticsNodeCard', () => {
  it('uses one extrude depth and corner radius', () => {
    expect(NODE_EXTRUDE_DEPTH).toBeGreaterThan(0.03);
    expect(NODE_CARD_RADIUS).toBeLessThanOrEqual(NODE_EXTRUDE_DEPTH / 2);
  });

  it('resolves card and marker fills from role state', () => {
    const current = resolveNodeCardVisual('client-sync', 'current', false, true);
    const quiet = resolveNodeCardVisual('client-sync', 'quiet', false, true);
    const marker = resolveNodeCardVisual('client-sync', 'current', false, false);

    expect(current.fillColor.getHex()).not.toBe(quiet.fillColor.getHex());
    expect(marker.fillOpacity).toBeGreaterThan(0);
  });
});

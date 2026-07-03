import { describe, expect, it } from 'vitest';
import { FLAT_ROLE_STYLE } from '../diagnosticsNodeGlassMaterial.js';

describe('diagnosticsNodeGlassMaterial', () => {
  it('defines flat role opacity and border styling', () => {
    expect(FLAT_ROLE_STYLE.path.opacity).toBe(0.88);
    expect(FLAT_ROLE_STYLE.path.border).toBe('#22d3ee');
    expect(FLAT_ROLE_STYLE.current.opacity).toBe(1);
    expect(FLAT_ROLE_STYLE.current.border).toBe('#fb923c');
  });
});

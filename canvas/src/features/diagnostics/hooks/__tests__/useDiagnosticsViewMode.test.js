import { describe, expect, it } from 'vitest';
import { useDiagnosticsViewMode } from '../useDiagnosticsViewMode.js';

describe('useDiagnosticsViewMode', () => {
  it('exports a hook factory', () => {
    expect(typeof useDiagnosticsViewMode).toBe('function');
  });
});

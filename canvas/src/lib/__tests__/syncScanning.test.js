import { describe, it, expect } from 'vitest';
import { resolveScanExitStatus } from '../syncScanning.js';

describe('resolveScanExitStatus', () => {
  it('clears scanning flag and applies terminal status', () => {
    expect(
      resolveScanExitStatus({ scanning: true }, { error: 'read failed' }),
    ).toEqual({ error: 'read failed' });
  });

  it('clears scanning to null when no terminal status', () => {
    expect(resolveScanExitStatus({ scanning: true }, null)).toBe(null);
  });

  it('leaves non-scanning status unchanged', () => {
    const prev = { toast: 'done' };
    expect(resolveScanExitStatus(prev, { error: 'x' })).toBe(prev);
  });
});

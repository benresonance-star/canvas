import { describe, expect, it } from 'vitest';
import { THEME_CYCLE } from '../../lib/constants.js';
import { isValidTheme, nextTheme } from '../useTheme.js';

describe('useTheme helpers', () => {
  it('validates theme ids', () => {
    expect(isValidTheme('light')).toBe(true);
    expect(isValidTheme('dark')).toBe(true);
    expect(isValidTheme('green')).toBe(true);
    expect(isValidTheme('blue')).toBe(true);
    expect(isValidTheme('sage')).toBe(false);
    expect(isValidTheme(null)).toBe(false);
  });

  it('cycles light → dark → green → blue → light', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('green');
    expect(nextTheme('green')).toBe('blue');
    expect(nextTheme('blue')).toBe('light');
  });

  it('falls back to light for unknown current theme', () => {
    expect(nextTheme('invalid')).toBe('light');
  });

  it('THEME_CYCLE order matches plan', () => {
    expect(THEME_CYCLE).toEqual(['light', 'dark', 'green', 'blue']);
  });
});

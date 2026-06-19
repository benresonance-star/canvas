import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveSpreadsheetViewerIsDark,
  resolveSpreadsheetViewerTheme,
} from '../spreadsheetViewerTheme.js';

function mockPreviewBg(color) {
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name) => (name === '--color-preview-bg' ? color : ''),
  }));
}

describe('resolveSpreadsheetViewerTheme', () => {
  it('uses light viewer palette for light theme', () => {
    expect(resolveSpreadsheetViewerTheme('light')).toBe(false);
    expect(resolveSpreadsheetViewerTheme('light', { inCard: true })).toBe(false);
  });

  it('uses dark viewer palette for dark theme', () => {
    expect(resolveSpreadsheetViewerTheme('dark')).toBe(true);
    expect(resolveSpreadsheetViewerTheme('dark', { inCard: true })).toBe(true);
  });

  it('uses light viewer inside cards for green and blue themes', () => {
    expect(resolveSpreadsheetViewerTheme('green', { inCard: true })).toBe(false);
    expect(resolveSpreadsheetViewerTheme('blue', { inCard: true })).toBe(false);
  });

  it('uses dark viewer in modal for green and blue themes', () => {
    expect(resolveSpreadsheetViewerTheme('green', { inCard: false })).toBe(true);
    expect(resolveSpreadsheetViewerTheme('blue', { inCard: false })).toBe(true);
  });
});

describe('resolveSpreadsheetViewerIsDark', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false for light preview surfaces', () => {
    mockPreviewBg('#ffffff');
    expect(resolveSpreadsheetViewerIsDark({})).toBe(false);
  });

  it('returns true for dark preview surfaces', () => {
    mockPreviewBg('#1a1816');
    expect(resolveSpreadsheetViewerIsDark({})).toBe(true);
  });

  it('follows card preview overrides in tinted themes', () => {
    mockPreviewBg('#fafaf9');
    expect(resolveSpreadsheetViewerIsDark({})).toBe(false);
  });
});

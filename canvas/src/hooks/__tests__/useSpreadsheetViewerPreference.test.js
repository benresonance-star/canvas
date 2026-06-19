import { describe, expect, it } from 'vitest';
import { SPREADSHEET_VIEWER_STORAGE_KEY } from '../../lib/constants.js';
import { isValidSpreadsheetViewer } from '../useSpreadsheetViewerPreference.js';

describe('useSpreadsheetViewerPreference helpers', () => {
  it('validates viewer ids', () => {
    expect(isValidSpreadsheetViewer('simple')).toBe(true);
    expect(isValidSpreadsheetViewer('extend')).toBe(true);
    expect(isValidSpreadsheetViewer('excel')).toBe(false);
    expect(isValidSpreadsheetViewer(null)).toBe(false);
  });

  it('uses the expected storage key', () => {
    expect(SPREADSHEET_VIEWER_STORAGE_KEY).toBe('canvas:spreadsheet-viewer');
  });
});

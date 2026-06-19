import { describe, expect, it } from 'vitest';
import { isCsvSpreadsheet } from '../spreadsheetViewer.js';

describe('isCsvSpreadsheet', () => {
  it('detects csv by extension', () => {
    expect(isCsvSpreadsheet({ ext: 'csv', filename: 'report.csv' })).toBe(true);
  });

  it('detects csv by filename when ext is missing', () => {
    expect(isCsvSpreadsheet({ filename: 'data.CSV' })).toBe(true);
  });

  it('returns false for xlsx files', () => {
    expect(isCsvSpreadsheet({ ext: 'xlsx', filename: 'model.xlsx' })).toBe(false);
  });
});

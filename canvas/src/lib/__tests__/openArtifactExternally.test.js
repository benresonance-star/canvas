import { describe, expect, it } from 'vitest';
import {
  canOpenArtifactExternally,
  extFromVersion,
  mimeFromExt,
} from '../openArtifactExternally.js';

describe('mimeFromExt', () => {
  it('maps spreadsheet extensions', () => {
    expect(mimeFromExt('xlsx')).toContain('spreadsheetml');
    expect(mimeFromExt('csv')).toBe('text/csv');
  });

  it('maps JSON and Python code extensions', () => {
    expect(mimeFromExt('json')).toBe('application/json');
    expect(mimeFromExt('py')).toBe('text/x-python');
  });
});

describe('canOpenArtifactExternally', () => {
  it('is false when missing from folder', () => {
    expect(
      canOpenArtifactExternally({
        folderHandle: {},
        version: { filename: 'a.xlsx', objectUrl: 'blob:x' },
        missingFromFolder: true,
      }),
    ).toBe(false);
  });

  it('is true with filename only (folder may reconnect later)', () => {
    expect(
      canOpenArtifactExternally({
        folderHandle: null,
        version: { filename: 'general__Test-v1.xlsx' },
        missingFromFolder: false,
      }),
    ).toBe(true);
  });

  it('is true with preview cache key', () => {
    expect(
      canOpenArtifactExternally({
        folderHandle: null,
        version: { previewCacheKey: 'abc' },
        missingFromFolder: false,
      }),
    ).toBe(true);
  });

  it('is true with blob fallback only', () => {
    expect(
      canOpenArtifactExternally({
        folderHandle: null,
        version: { dataUrl: 'data:text/plain,hi' },
        missingFromFolder: false,
      }),
    ).toBe(true);
  });
});

describe('extFromVersion', () => {
  it('parses extension from filename when ext field missing', () => {
    expect(extFromVersion({ filename: 'general__book-v1.xlsx' })).toBe('xlsx');
  });
});

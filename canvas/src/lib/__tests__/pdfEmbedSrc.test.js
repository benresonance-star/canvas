import { describe, expect, it } from 'vitest';
import { pdfEmbedSrc } from '../pdfEmbedSrc.js';

describe('pdfEmbedSrc', () => {
  it('appends toolbar and fit view hash params', () => {
    const blob = 'blob:http://localhost/abc-123';
    expect(pdfEmbedSrc(blob)).toBe(
      `${blob}#toolbar=1&navpanes=1&view=FitH`,
    );
  });

  it('replaces an existing hash fragment', () => {
    expect(pdfEmbedSrc('blob:x#page=3')).toBe(
      'blob:x#toolbar=1&navpanes=1&view=FitH',
    );
  });

  it('passes through empty values', () => {
    expect(pdfEmbedSrc(null)).toBe(null);
    expect(pdfEmbedSrc('')).toBe('');
  });
});

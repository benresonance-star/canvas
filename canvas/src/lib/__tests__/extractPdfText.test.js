import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

import * as pdfjs from 'pdfjs-dist';
import { extractPdfText } from '../extractPdfText.js';

describe('extractPdfText', () => {
  beforeEach(() => {
    vi.mocked(pdfjs.getDocument).mockReset();
  });

  it('joins text from pages', async () => {
    vi.mocked(pdfjs.getDocument).mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async (n) => ({
          getTextContent: async () => ({
            items: [{ str: n === 1 ? 'Page one' : 'Page two' }],
          }),
        }),
      }),
    });

    const result = await extractPdfText(new Blob(['pdf']), {
      maxPages: 5,
      maxChars: 1000,
    });
    expect(result.text).toContain('Page one');
    expect(result.text).toContain('Page two');
    expect(result.pagesTotal).toBe(2);
    expect(result.pagesIncluded).toBe(2);
  });
});

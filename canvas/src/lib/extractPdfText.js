import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export const PDF_MAX_PAGES = 40;
export const PDF_MAX_CHARS = 24_000;

/**
 * @param {File | Blob} file
 */
export async function getPdfPageCount(file) {
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  return doc.numPages;
}

/**
 * Extract plain text from a PDF File.
 * @param {File | Blob} file
 * @param {{ maxPages?: number, maxChars?: number }} [options]
 * @returns {Promise<{ text: string, pagesTotal: number, pagesIncluded: number }>}
 */
export async function extractPdfText(file, options = {}) {
  const maxPages = options.maxPages ?? PDF_MAX_PAGES;
  const maxChars = options.maxChars ?? PDF_MAX_CHARS;
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pagesTotal = doc.numPages;
  const pageCount = Math.min(pagesTotal, maxPages);
  const parts = [];

  for (let i = 1; i <= pageCount; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    if (pageText) parts.push(pageText);
    if (parts.join('\n\n').length >= maxChars) break;
  }

  let text = parts.join('\n\n').trim();
  if (pagesTotal > maxPages) {
    text += `\n\n[… truncated after ${maxPages} pages]`;
  }
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n\n[… truncated]`;
  }
  return { text, pagesTotal, pagesIncluded: pageCount };
}

import { describe, expect, it } from 'vitest';
import { buildHtmlPreviewSrcDoc } from '../htmlPreviewDocument.js';

describe('buildHtmlPreviewSrcDoc', () => {
  it('injects an iframe-local base URL into full HTML documents', () => {
    const srcDoc = buildHtmlPreviewSrcDoc('<html><head><title>x</title></head><body></body></html>');

    expect(srcDoc).toContain('<head>\n<base href="about:srcdoc">');
    expect(srcDoc).toContain('<title>x</title>');
  });

  it('wraps fragments and can intercept hash-only links', () => {
    const srcDoc = buildHtmlPreviewSrcDoc('<a href="#section">Section</a><h2 id="section">S</h2>', {
      interceptInternalLinks: true,
    });

    expect(srcDoc).toContain('<base href="about:srcdoc">');
    expect(srcDoc).toContain("href.startsWith('#')");
    expect(srcDoc).toContain('scrollIntoView');
    expect(srcDoc).toContain('<body><a href="#section">Section</a>');
  });
});

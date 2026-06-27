import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractTextFromHtml,
  extractUrlsFromText,
  resolveCanvasArtifactSource,
  resolveManualTextSource,
  resolveUrlSourceText,
} from '../liveSourceContent.js';

describe('liveSourceContent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts visible text from html', () => {
    const html = '<html><head><title>T</title><style>.x{}</style></head><body><p>Hello <b>world</b></p></body></html>';
    expect(extractTextFromHtml(html)).toContain('Hello world');
  });

  it('extracts one url per line from manual text', () => {
    expect(extractUrlsFromText('notes\nhttps://example.com/path\nmore')).toEqual([
      'https://example.com/path',
    ]);
  });

  it('fetches html and formats url source text', async () => {
    const html = '<html><head><title>Example</title><meta property="og:description" content="Desc" /></head><body><p>Body text</p></body></html>';
    const fetchImpl = vi.fn().mockResolvedValue({
      headers: { get: () => 'text/html; charset=utf-8' },
      arrayBuffer: async () => Buffer.from(html),
    });

    const text = await resolveUrlSourceText('https://example.com', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(text).toContain('URL: https://example.com/');
    expect(text).toContain('Title: Example');
    expect(text).toContain('Description: Desc');
    expect(text).toContain('Body text');
  });

  it('returns fetch failure note for blocked hosts', async () => {
    const text = await resolveUrlSourceText('http://localhost/secret');
    expect(text).toContain('[Fetch failed:');
    expect(text).toContain('localhost');
  });

  it('resolves bookmark artifacts via external_url metadata', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      headers: { get: () => 'text/plain' },
      arrayBuffer: async () => Buffer.from('plain body'),
    });
    const text = await resolveCanvasArtifactSource({
      payload_text: null,
      type: 'other',
      metadata: {
        canvas_kind: 'bookmark',
        external_url: 'https://planning.vic.gov.au',
      },
    }, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(text).toContain('https://planning.vic.gov.au');
    expect(text).toContain('plain body');
  });

  it('keeps non-url manual text and fetches url lines', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      headers: { get: () => 'text/plain' },
      arrayBuffer: async () => Buffer.from('fetched'),
    });
    const text = await resolveManualTextSource(
      'Seed assumptions\nhttps://example.com',
      { fetchImpl },
    );
    expect(text).toContain('Seed assumptions');
    expect(text).toContain('fetched');
  });
});

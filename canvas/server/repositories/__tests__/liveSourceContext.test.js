import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockResolveManualTextSource = vi.fn();
const mockResolveCanvasArtifactSource = vi.fn();

vi.mock('../../db.js', () => ({
  pool: {
    query: (...args) => mockQuery(...args),
    connect: vi.fn(),
  },
}));

vi.mock('../../services/liveSourceContent.js', () => ({
  resolveManualTextSource: (...args) => mockResolveManualTextSource(...args),
  resolveCanvasArtifactSource: (...args) => mockResolveCanvasArtifactSource(...args),
}));

const { buildLiveSourceContext } = await import('../live-artifacts.js');

describe('buildLiveSourceContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveManualTextSource.mockImplementation(async (text) => text);
    mockResolveCanvasArtifactSource.mockImplementation(async (row) => row?.payload_text || '');
  });

  it('includes enabled manual sources and skips disabled ones', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 's1',
          live_artifact_id: 'live-1',
          source_type: 'manual_text',
          source_id: null,
          label: 'Seed',
          manual_text: 'Alpha',
          is_enabled: true,
          sort_order: 0,
          created_at: null,
          updated_at: null,
        },
        {
          id: 's2',
          live_artifact_id: 'live-1',
          source_type: 'manual_text',
          source_id: null,
          label: 'Hidden',
          manual_text: 'Beta',
          is_enabled: false,
          sort_order: 1,
          created_at: null,
          updated_at: null,
        },
      ],
    });
    mockResolveManualTextSource.mockResolvedValueOnce('Alpha');

    const context = await buildLiveSourceContext({
      id: 'live-1',
      maxSourceChars: 24000,
      latestVersion: null,
    });

    expect(context).toBe('SOURCE — Seed\nAlpha');
    expect(mockResolveManualTextSource).toHaveBeenCalledWith('Alpha', expect.any(Object));
  });

  it('resolves bookmark canvas artifacts through url fetch helper', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 's1',
          live_artifact_id: 'live-1',
          source_type: 'canvas_artifact',
          source_id: 'art-1',
          label: 'Council site',
          manual_text: null,
          is_enabled: true,
          sort_order: 0,
          created_at: null,
          updated_at: null,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          payload_text: null,
          type: 'other',
          metadata: { canvas_kind: 'bookmark', external_url: 'https://example.com' },
        }],
      });
    mockResolveCanvasArtifactSource.mockResolvedValueOnce('URL: https://example.com/\nContent:\nFetched');

    const context = await buildLiveSourceContext({
      id: 'live-1',
      maxSourceChars: 24000,
      latestVersion: null,
    });

    expect(mockResolveCanvasArtifactSource).toHaveBeenCalled();
    expect(context).toContain('SOURCE — Council site');
    expect(context).toContain('Fetched');
  });

  it('respects maxSourceChars', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 's1',
        live_artifact_id: 'live-2',
        source_type: 'manual_text',
        source_id: null,
        label: 'Notes',
        manual_text: 'x'.repeat(100),
        is_enabled: true,
        sort_order: 0,
        created_at: null,
        updated_at: null,
      }],
    });
    mockResolveManualTextSource.mockResolvedValueOnce('x'.repeat(100));

    const context = await buildLiveSourceContext({
      id: 'live-2',
      maxSourceChars: 40,
      latestVersion: null,
    });

    expect(context.length).toBeLessThanOrEqual(40);
  });
});

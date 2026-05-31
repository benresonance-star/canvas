import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../db.js';
import {
  getPreviewBlob,
  putPreviewBlob,
  deletePreviewBlobsForProject,
  PREVIEW_BLOB_MAX_BYTES,
} from '../canvas-previews.js';

describe('canvas-previews repository', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it('putPreviewBlob rejects oversized blobs', async () => {
    const big = Buffer.alloc(PREVIEW_BLOB_MAX_BYTES + 1);
    await expect(
      putPreviewBlob('k1', 'proj', big, 'image/png'),
    ).rejects.toThrow(/byte limit/);
  });

  it('getPreviewBlob returns blob buffer', async () => {
    const buf = Buffer.from('png');
    vi.mocked(query).mockResolvedValue({
      rows: [{ blob: buf, content_type: 'image/png' }],
    });
    const row = await getPreviewBlob('k1');
    expect(row.blob).toEqual(buf);
    expect(row.contentType).toBe('image/png');
  });

  it('deletePreviewBlobsForProject calls query', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [] });
    await deletePreviewBlobsForProject('proj-1');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM canvas_preview_blob'),
      ['proj-1'],
    );
  });
});

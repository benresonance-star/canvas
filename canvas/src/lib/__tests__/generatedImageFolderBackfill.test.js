import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ensureWritePermission, writeBinaryFileAtPath } from '../folderWrite.js';
import { backfillMissingGeneratedImages } from '../generatedImageFolderBackfill.js';

vi.mock('../folderWrite.js', () => ({
  ensureWritePermission: vi.fn(async () => true),
  writeBinaryFileAtPath: vi.fn(async () => 'generated/agent/out.png'),
}));

describe('backfillMissingGeneratedImages', () => {
  beforeEach(() => {
    vi.mocked(ensureWritePermission).mockResolvedValue(true);
    vi.mocked(writeBinaryFileAtPath).mockClear();
  });

  it('writes missing generated image cards to the linked folder', async () => {
    const relativePath = 'generated/facade-agent/2026-06-24_0717_facade-agent_exec-0001_v01.png';
    const result = await backfillMissingGeneratedImages({
      folderHandle: {},
      folderPresentKeys: ['notes__other-note'],
      cards: [{
        type: 'image',
        key: relativePath,
        versions: [{
          version: 1,
          relativePath,
          filename: '2026-06-24_0717_facade-agent_exec-0001_v01.png',
          dataUrl: 'data:image/png;base64,cG5n',
        }],
      }],
    });

    expect(writeBinaryFileAtPath).toHaveBeenCalled();
    expect(result.written).toBe(1);
    expect(result.writtenKeys[0]).toContain('generated/facade-agent/');
  });
});

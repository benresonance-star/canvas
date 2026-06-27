import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ensureWritePermission, writeBinaryFileAtPath } from '../../../../lib/folderWrite.js';
import { cardKeyFromFilename } from '../../../../lib/filename.js';
import { persistGeneratedImageOutputs } from '../saveGeneratedImageToFolder.js';

vi.mock('../../../../lib/folderWrite.js', () => ({
  ensureWritePermission: vi.fn(async () => true),
  writeBinaryFileAtPath: vi.fn(async () => 'generated/agent/out.png'),
}));

vi.mock('../../../../lib/previewStore.js', () => ({
  previewCacheKey: vi.fn(() => 'preview:generated'),
  putPreview: vi.fn(async () => {}),
}));

describe('persistGeneratedImageOutputs', () => {
  beforeEach(() => {
    vi.mocked(ensureWritePermission).mockResolvedValue(true);
    vi.mocked(writeBinaryFileAtPath).mockClear();
  });

  it('writes folder-backed cards with canonical keys and strips inline data when saved', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('card-1');
    const folderHandle = {};
    const relativePath = 'generated/facade-agent/2026-06-24_0717_facade-agent_exec-0001_v01.png';
    const { cards, writtenKeys, folderWriteOk } = await persistGeneratedImageOutputs({
      folderHandle,
      projectId: 'project-1',
      outputs: [{
        id: 'artifact-1',
        filename: '2026-06-24_0717_facade-agent_exec-0001_v01.png',
        filePath: `projects/project-1/${relativePath}`,
        contentHash: 'hash-1',
        dataUrl: 'data:image/png;base64,cG5n',
      }],
      positions: [{ x: 10, y: 20 }],
    });

    expect(folderWriteOk).toBe(true);
    expect(writeBinaryFileAtPath).toHaveBeenCalled();
    expect(cards[0].key).toBe(cardKeyFromFilename(relativePath));
    expect(cards[0].versions[0]).toMatchObject({
      relativePath,
      content_hash: 'hash-1',
      artifactRef: { id: 'artifact-1', type: 'artifact' },
    });
    expect(cards[0].versions[0].dataUrl).toBeUndefined();
    expect(cards[0].versions[0].inline).toBeUndefined();
    expect(cards[0].versions[0].objectUrl).toMatch(/^blob:/);
    expect(cards[0].versions[0].previewCacheKey).toBe('preview:generated');
    expect(cards[0].versions[0].size).toBeGreaterThan(0);
    expect(writtenKeys).toEqual([cardKeyFromFilename(relativePath)]);
  });

  it('keeps inline preview when folder write is unavailable', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('card-2');
    const { cards, writtenKeys, folderWriteOk } = await persistGeneratedImageOutputs({
      folderHandle: null,
      outputs: [{
        id: 'artifact-2',
        filename: 'generated.png',
        filePath: 'projects/project-1/generated/agent/generated.png',
        contentHash: 'hash-2',
        dataUrl: 'data:image/png;base64,abc',
      }],
    });

    expect(folderWriteOk).toBe(true);
    expect(writtenKeys).toEqual([]);
    expect(cards[0].versions[0]).toMatchObject({
      inline: true,
      dataUrl: 'data:image/png;base64,abc',
    });
  });
});

import { ensureWritePermission, writeBinaryFileAtPath } from '../../../lib/folderWrite.js';
import {
  cardKeyFromFilename,
  folderPathBasename,
  toCanonicalSyncKey,
} from '../../../lib/filename.js';
import { previewCacheKey, putPreview } from '../../../lib/previewStore.js';
import { buildImageArtifactMetadata } from '../../../lib/image/imageArtifactMetadata.js';
import { folderBackedGeneratedImageCard, relativePathFromOutput } from './agentArtifact.js';

export { relativePathFromOutput } from './agentArtifact.js';

export function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl ?? '').split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function mimeFromDataUrl(dataUrl) {
  return String(dataUrl ?? '').match(/^data:([^;,]+)/)?.[1] || 'image/png';
}

export function dataUrlToBlob(dataUrl) {
  const bytes = dataUrlToBytes(dataUrl);
  return new Blob([bytes], { type: mimeFromDataUrl(dataUrl) });
}

export async function buildGeneratedImagePreview({
  projectId,
  relativePath,
  dataUrl,
  version = 1,
  width = null,
  height = null,
}) {
  const cardKey = cardKeyFromFilename(relativePath);
  const cacheKey = projectId && cardKey
    ? previewCacheKey(projectId, cardKey, version)
    : null;
  const blob = dataUrlToBlob(dataUrl);
  const bytes = dataUrlToBytes(dataUrl);
  const ext = relativePath?.split('.').pop()?.toLowerCase() || 'png';
  if (cacheKey) {
    await putPreview(cacheKey, blob);
  }
  const imageMetadata = buildImageArtifactMetadata(bytes, {
    mimeType: mimeFromDataUrl(dataUrl),
    ext,
    fileSizeBytes: blob.size,
    width: width ?? undefined,
    height: height ?? undefined,
  });
  return {
    objectUrl: URL.createObjectURL(blob),
    previewCacheKey: cacheKey,
    size: blob.size,
    previewStripped: false,
    imageMetadata,
  };
}

export function mergeFolderPresentKeys(existing, addedKeys = []) {
  const canon = new Set(
    (existing ?? [])
      .map((key) => toCanonicalSyncKey(key))
      .filter(Boolean),
  );
  for (const key of addedKeys) {
    const normalized = toCanonicalSyncKey(key);
    if (normalized) canon.add(normalized);
  }
  return [...canon];
}

/**
 * Write generated image bytes to the linked folder and build folder-backed canvas cards.
 * @param {{
 *   folderHandle?: FileSystemDirectoryHandle | null,
 *   projectId?: string | null,
 *   outputs?: object[],
 *   positions?: Array<{ x: number, y: number }>,
 *   executionId?: string | null,
 * }} params
 */
export async function persistGeneratedImageOutputs({
  folderHandle = null,
  projectId = null,
  outputs = [],
  positions = [],
  executionId = null,
}) {
  void executionId;
  const canWrite = folderHandle ? await ensureWritePermission(folderHandle) : false;
  const writtenKeys = [];
  const cards = [];
  let folderWriteOk = !folderHandle;

  for (let index = 0; index < outputs.length; index += 1) {
    const output = outputs[index];
    const relativePath = relativePathFromOutput(output);
    const filename = output.filename || folderPathBasename(relativePath) || `generated__${output.id}.png`;
    let folderWritten = false;
    let preview = null;

    if (folderHandle && canWrite && relativePath && output.dataUrl) {
      try {
        const bytes = dataUrlToBytes(output.dataUrl);
        await writeBinaryFileAtPath(folderHandle, relativePath, bytes);
        preview = await buildGeneratedImagePreview({
          projectId,
          relativePath,
          dataUrl: output.dataUrl,
          width: output.metadata?.image?.width ?? output.metadata?.width ?? output.width,
          height: output.metadata?.image?.height ?? output.metadata?.height ?? output.height,
        });
        folderWritten = true;
        const key = cardKeyFromFilename(relativePath);
        if (key) writtenKeys.push(toCanonicalSyncKey(key));
        folderWriteOk = true;
      } catch {
        folderWriteOk = false;
      }
    } else if (folderHandle && !canWrite) {
      folderWriteOk = false;
    }

    cards.push(
      folderBackedGeneratedImageCard(
        { ...output, filename },
        positions[index] ?? { x: 120 + index * 40, y: 120 + index * 40 },
        { folderWritten, preview },
      ),
    );
  }

  return { cards, writtenKeys, folderWriteOk };
}

import {
  PREVIEW_MAX_BYTES_IMAGE_PDF,
  STORAGE_LIMIT,
} from './constants.js';
import { fileTypeFromExt } from './filename.js';
import { putPreview } from './previewStore.js';
import { sha256Hex } from './ingest/hashFile.js';
import { parseAudioTags } from './audio/parseAudioTags.js';
import { buildImageArtifactMetadata } from './image/imageArtifactMetadata.js';

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}

export async function readFileEntry(entry, options = {}) {
  const { cacheKey, relativePath = null } = options;
  const file =
    typeof entry?.getFile === 'function'
      ? await entry.getFile()
      : entry;
  if (!file) {
    throw new Error('File entry unavailable');
  }
  const content_hash = await sha256Hex(file);
  const name = entry.name ?? file.name;
  const ext = name.split('.').pop().toLowerCase();
  const type = fileTypeFromExt(ext);
  const isSmall = file.size <= STORAGE_LIMIT;
  const isImageOrPdf = type === 'image' || type === 'pdf';

  let content = null;
  let dataUrl = null;
  let objectUrl = null;
  let previewCacheKey = null;
  let audioMeta = null;
  let imageMeta = null;

  if (
    type === 'markdown'
    || type === 'note'
    || type === 'user_note'
    || type === 'html'
    || type === 'code'
  ) {
    if (isSmall) {
      content = await file.text();
    }
  } else if (type === 'video' || type === 'audio') {
    if (file.size <= PREVIEW_MAX_BYTES_IMAGE_PDF) {
      const buf = await file.arrayBuffer();
      const blob = new Blob([buf], { type: file.type || 'application/octet-stream' });
      if (cacheKey) {
        await putPreview(cacheKey, blob);
        previewCacheKey = cacheKey;
      }
      objectUrl = URL.createObjectURL(blob);
      if (type === 'video' && isSmall) {
        dataUrl = await blobToDataUrl(blob);
      }
      if (type === 'audio') {
        audioMeta = await parseAudioTags(file);
      }
    }
  } else if (type === 'spreadsheet') {
    if (file.size <= PREVIEW_MAX_BYTES_IMAGE_PDF) {
      const buf = await file.arrayBuffer();
      const blob = new Blob([buf], { type: file.type || 'application/octet-stream' });
      if (cacheKey) {
        await putPreview(cacheKey, blob);
        previewCacheKey = cacheKey;
      }
      objectUrl = URL.createObjectURL(blob);
    }
  } else if (isImageOrPdf) {
    if (file.size <= PREVIEW_MAX_BYTES_IMAGE_PDF) {
      const buf = await file.arrayBuffer();
      const blob = new Blob([buf], { type: file.type || 'application/octet-stream' });
      if (type === 'image') {
        imageMeta = buildImageArtifactMetadata(new Uint8Array(buf), {
          mimeType: file.type || `image/${ext}`,
          ext,
          fileSizeBytes: file.size,
        });
      }
      if (cacheKey) {
        await putPreview(cacheKey, blob);
        previewCacheKey = cacheKey;
      }
      if (isSmall) {
        dataUrl = await blobToDataUrl(blob);
      } else {
        objectUrl = URL.createObjectURL(blob);
      }
    }
  }

  const inline =
    isSmall &&
    (content !== null ||
      (Boolean(dataUrl) && !objectUrl) ||
      (type === 'video' && Boolean(dataUrl)) ||
      (type === 'audio' && Boolean(objectUrl)));

  return {
    filename: name,
    ...(relativePath ? { relativePath } : {}),
    content_hash,
    size: file.size,
    lastModified: file.lastModified,
    content,
    dataUrl,
    objectUrl,
    inline,
    previewStripped: false,
    previewCacheKey,
    audioMeta,
    imageMeta,
  };
}

import {
  PREVIEW_MAX_BYTES_IMAGE_PDF,
  PREVIEW_MAX_BYTES_3D_MODEL,
  GLTF_JSON_TEXT_MAX_BYTES,
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
  const isThreeDModel = type === '3d-model';
  const isBimModel = type === 'bim-model';

  let content = null;
  let dataUrl = null;
  let objectUrl = null;
  let previewCacheKey = null;
  let audioMeta = null;
  let imageMeta = null;
  let previewFeasible = true;
  let threeDDisplayMode = null;
  let gltfJsonText = null;

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
  } else if (isThreeDModel) {
    if (file.size <= PREVIEW_MAX_BYTES_3D_MODEL) {
      const buf = await file.arrayBuffer();
      if (ext === 'gltf' && file.size <= GLTF_JSON_TEXT_MAX_BYTES) {
        gltfJsonText = new TextDecoder().decode(buf);
      }
      const blob = new Blob([buf], { type: file.type || (ext === 'gltf' ? 'model/gltf+json' : 'model/gltf-binary') });
      if (cacheKey) {
        await putPreview(cacheKey, blob);
        previewCacheKey = cacheKey;
      }
      objectUrl = URL.createObjectURL(blob);
    } else {
      if (ext === 'gltf' && file.size <= GLTF_JSON_TEXT_MAX_BYTES) {
        gltfJsonText = await file.text();
      }
      previewFeasible = false;
      threeDDisplayMode = 'folder_on_demand';
    }
  } else if (isBimModel) {
    if (file.size <= PREVIEW_MAX_BYTES_3D_MODEL) {
      const buf = await file.arrayBuffer();
      const blob = new Blob([buf], { type: file.type || 'application/x-step' });
      if (cacheKey) {
        await putPreview(cacheKey, blob);
        previewCacheKey = cacheKey;
      }
      objectUrl = URL.createObjectURL(blob);
    } else {
      previewFeasible = false;
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
      (type === 'audio' && Boolean(objectUrl)) ||
      (type === '3d-model' && Boolean(objectUrl)) ||
      (type === 'bim-model' && Boolean(objectUrl)));

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
    previewFeasible,
    ...(threeDDisplayMode ? { threeDDisplayMode } : {}),
    ...(gltfJsonText ? { gltfJsonText } : {}),
    audioMeta,
    imageMeta,
  };
}

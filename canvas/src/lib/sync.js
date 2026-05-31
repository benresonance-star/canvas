import { fileTypeFromExt } from './filename.js';

/** Merge binary/text preview fields from a fresh disk read onto an existing version row */
export function pickPreviewFieldsFromDisk(disk) {
  return {
    filename: disk.filename,
    size: disk.size,
    lastModified: disk.lastModified,
    content: disk.content,
    content_hash: disk.content_hash,
    dataUrl: disk.dataUrl,
    objectUrl: disk.objectUrl,
    inline: disk.inline,
    previewStripped: disk.previewStripped ?? false,
    previewCacheKey: disk.previewCacheKey ?? null,
    ...(disk.artifactRef ? { artifactRef: disk.artifactRef } : {}),
  };
}

export function shouldRefreshVersionFromDisk(ev, diskV) {
  if (!diskV) return false;
  if (ev.previewStripped && !ev.previewCacheKey) return true;
  if (ev.previewCacheKey && !ev.dataUrl && !ev.objectUrl) return true;
  if (ev.contentStripped && diskV.content) return true;
  if (
    ev.content_hash
    && diskV.content_hash
    && ev.content_hash !== diskV.content_hash
  ) {
    return true;
  }
  if (
    diskV.content != null
    && diskV.content !== ''
    && ev.content !== diskV.content
  ) {
    return true;
  }
  if (ev.lastModified !== diskV.lastModified || ev.size !== diskV.size) return true;
  const ext = (ev.ext || '').toLowerCase();
  const t = fileTypeFromExt(ext);
  const diskHasBinary = Boolean(diskV.dataUrl || diskV.objectUrl);
  if ((t === 'image' || t === 'pdf' || t === 'video') && !ev.dataUrl && !ev.objectUrl && diskHasBinary) return true;
  return false;
}

export function mergeDiskPreviewIntoCardVersions(cardVersions, diskVersions) {
  const cardList = cardVersions ?? [];
  const diskList = diskVersions ?? [];
  const diskBy = new Map(diskList.map((v) => [v.version, v]));
  return cardList.map((ev) => {
    const diskV = diskBy.get(ev.version);
    if (!diskV || !shouldRefreshVersionFromDisk(ev, diskV)) return ev;
    return { ...ev, ...pickPreviewFieldsFromDisk(diskV) };
  });
}
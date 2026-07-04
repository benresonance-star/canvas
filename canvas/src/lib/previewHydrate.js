import { fileTypeFromExt } from './filename.js';
import { getPreview } from './previewStore.js';
import { isBlobUrl, stripEphemeralPreviewUrls } from './previewUrl.js';

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}

export function versionNeedsHydration(v) {
  const version = stripEphemeralPreviewUrls(v);
  if (!version.previewCacheKey) return false;
  if (isBlobUrl(version.objectUrl)) return true;
  if (version.dataUrl || version.objectUrl) {
    return Boolean(version.previewStripped);
  }
  if (v.cardType === 'bookmark' || v.externalUrl) {
    return Boolean(v.previewCacheKey);
  }
  const ext = (v.ext || '').toLowerCase();
  const t = fileTypeFromExt(ext);
  return t === 'image' || t === 'pdf' || t === 'video' || t === 'audio' || t === '3d-model' || t === 'bim-model';
}

export async function hydrateVersion(v, { force = false, localOnly = false } = {}) {
  const version = stripEphemeralPreviewUrls(v);
  if (!version.previewCacheKey) {
    if (version.previewStripped && (version.dataUrl || version.objectUrl)) {
      return { ...version, previewStripped: false };
    }
    return version;
  }

  if (!force && !versionNeedsHydration(version)) {
    return version;
  }

  const blob = await getPreview(version.previewCacheKey, { localOnly });
  if (!blob) return version;

  const ext = (version.ext || '').toLowerCase();
  const type = version.cardType === 'bookmark' ? 'image' : fileTypeFromExt(ext);
  const isImageOrPdf = type === 'image' || type === 'pdf';

  if (isImageOrPdf || type === 'video' || type === 'audio' || type === '3d-model' || type === 'bim-model') {
    const objectUrl = URL.createObjectURL(blob);
    return {
      ...version,
      objectUrl,
      dataUrl: force ? null : (version.dataUrl ?? null),
      previewStripped: false,
      inline: true,
    };
  }

  return version;
}

async function hydrateCard(c, { localOnly = false }) {
  return {
    ...c,
    versions: await Promise.all(
      (c.versions ?? []).map((v) => hydrateVersion(v, { localOnly })),
    ),
  };
}

function idleYield() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 32 });
    } else {
      requestAnimationFrame(() => resolve());
    }
  });
}

/**
 * @param {object[]} cards
 * @param {{ localOnly?: boolean, chunkSize?: number }} [options]
 */
export async function hydrateCardsPreviews(cards, { localOnly = false, chunkSize = 0 } = {}) {
  const list = cards ?? [];
  if (!chunkSize || list.length <= chunkSize) {
    return Promise.all(list.map((c) => hydrateCard(c, { localOnly })));
  }
  const out = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    const slice = list.slice(i, i + chunkSize);
    const hydrated = await Promise.all(slice.map((c) => hydrateCard(c, { localOnly })));
    out.push(...hydrated);
    if (i + chunkSize < list.length) {
      await idleYield();
    }
  }
  return out;
}

/** Default batch size for progressive preview hydration during load. */
export const PREVIEW_HYDRATE_CHUNK_SIZE = 12;

export function cardsPreviewsChanged(before, after) {
  const aList = before ?? [];
  const bList = after ?? [];
  if (aList.length !== bList.length) return true;
  for (let i = 0; i < aList.length; i++) {
    const a = aList[i];
    const b = bList[i];
    const aVersions = a.versions ?? [];
    const bVersions = b.versions ?? [];
    if (a.id !== b.id || aVersions.length !== bVersions.length) return true;
    for (let j = 0; j < aVersions.length; j++) {
      const av = aVersions[j];
      const bv = bVersions[j];
      if (
        av.version !== bv.version
        || av.objectUrl !== bv.objectUrl
        || av.dataUrl !== bv.dataUrl
        || av.previewStripped !== bv.previewStripped
      ) {
        return true;
      }
    }
  }
  return false;
}

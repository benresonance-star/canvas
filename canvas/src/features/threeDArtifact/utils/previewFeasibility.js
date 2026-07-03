import {
  PREVIEW_MAX_BYTES_3D_MODEL,
  THREE_D_HARD_MAX_BYTES,
} from '../../../lib/constants.js';
import { detectThreeDFormat, isSupportedThreeDFormat } from './fileFormat.js';

/** @typedef {'inline_ok' | 'folder_on_demand' | 'hard_limit' | 'no_folder' | 'too_large' | 'unsupported' | 'no_source'} ThreeDPreviewFeasibility */

/**
 * @param {object|null|undefined} version
 * @param {{ folderLinked?: boolean }} [options]
 * @returns {{ mode: ThreeDPreviewFeasibility, warnHeavy?: boolean }}
 */
export function assessThreeDPreviewFeasibility(version, { folderLinked = false } = {}) {
  const filename = version?.filename ?? version?.relativePath ?? '';
  const format = String(version?.ext || detectThreeDFormat(filename) || '').toLowerCase();
  const sizeBytes = version?.size ?? version?.threeD?.sourceFile?.sizeBytes ?? 0;
  const relativePath = version?.relativePath ?? version?.threeD?.sourceFile?.relativePath ?? null;
  const hasCachedSource = Boolean(
    version?.objectUrl || version?.dataUrl || version?.previewCacheKey,
  );

  if (!format || !isSupportedThreeDFormat(format)) {
    return { mode: format ? 'unsupported' : 'unsupported' };
  }

  if (sizeBytes > THREE_D_HARD_MAX_BYTES) {
    return { mode: 'hard_limit' };
  }

  if (hasCachedSource || sizeBytes <= PREVIEW_MAX_BYTES_3D_MODEL) {
    const warnHeavy = version?.threeD?.metadata?.estimatedComplexity === 'very_high';
    return { mode: 'inline_ok', warnHeavy };
  }

  if (!relativePath) {
    return { mode: 'no_source' };
  }

  if (!folderLinked) {
    return { mode: 'no_folder' };
  }

  const warnHeavy = version?.threeD?.metadata?.estimatedComplexity === 'very_high';
  return { mode: 'folder_on_demand', warnHeavy };
}

/**
 * @param {ThreeDPreviewFeasibility} mode
 * @returns {boolean}
 */
export function canAutoLoadThreeDSource(mode) {
  return mode === 'inline_ok';
}

/**
 * @param {ThreeDPreviewFeasibility} mode
 * @returns {boolean}
 */
export function canRequestFolderLoad(mode) {
  return mode === 'folder_on_demand';
}

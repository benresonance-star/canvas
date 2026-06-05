/** File System Access API: `showDirectoryPicker({ id })` max length. */
export const FOLDER_PICKER_ID_MAX_LENGTH = 32;

/**
 * Stable picker id per project (Chrome remembers last directory per id on same origin).
 * Must be ≤32 characters — UUIDs are compacted by removing hyphens (exactly 32 hex chars).
 * @param {string} projectId
 */
export function folderPickerId(projectId) {
  const raw = String(projectId ?? '').trim();
  if (!raw) return '';
  const compact = raw.replace(/-/g, '');
  if (
    compact.length > 0
    && compact.length <= FOLDER_PICKER_ID_MAX_LENGTH
    && /^[a-zA-Z0-9]+$/.test(compact)
  ) {
    return compact;
  }
  return fnv1aHex32(raw);
}

/**
 * Deterministic 32-char hex id for non-UUID / overlong project ids.
 * @param {string} seed
 */
function fnv1aHex32(seed) {
  let out = '';
  let s = seed;
  while (out.length < FOLDER_PICKER_ID_MAX_LENGTH) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    out += (h >>> 0).toString(16).padStart(8, '0');
    s = out;
  }
  return out.slice(0, FOLDER_PICKER_ID_MAX_LENGTH);
}

/**
 * Options for showDirectoryPicker with optional stable id when supported.
 * @param {string} projectId
 * @returns {{ mode: 'readwrite', id?: string }}
 */
export function buildDirectoryPickerOptions(projectId) {
  const options = { mode: 'readwrite' };
  if (projectId) {
    const id = folderPickerId(projectId);
    if (id && id.length <= FOLDER_PICKER_ID_MAX_LENGTH) {
      options.id = id;
    }
  }
  return options;
}

/**
 * @param {unknown} e
 * @param {boolean} hadId
 */
export function shouldRetryDirectoryPickerWithoutId(e, hadId) {
  if (!hadId) return false;
  if (e?.name === 'NotSupportedError') return true;
  if (isFolderPickerIdError(e)) return true;
  const msg = typeof e?.message === 'string' ? e.message : '';
  if (e?.name === 'TypeError' && msg.includes('showDirectoryPicker')) return true;
  return false;
}

/**
 * @param {unknown} e
 */
export function isFolderPickerBusyError(e) {
  const msg = typeof e?.message === 'string' ? e.message : '';
  return e?.name === 'InvalidStateError' || msg.includes('already active');
}

/**
 * @param {unknown} e
 */
export function isFolderPickerIdError(e) {
  const msg = typeof e?.message === 'string' ? e.message : '';
  return msg.includes('cannot be longer than 32 characters');
}

/**
 * Open the native directory picker once. Never call showDirectoryPicker twice in a row —
 * Chrome keeps the first picker "active" and the second call throws InvalidStateError.
 *
 * @param {string} [projectId]
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
export async function pickProjectDirectoryHandle(projectId) {
  if (!window.showDirectoryPicker) {
    throw new Error('Folder access not supported');
  }
  const withId = buildDirectoryPickerOptions(projectId ?? '');
  try {
    return await window.showDirectoryPicker(withId);
  } catch (e) {
    if (e?.name === 'AbortError' || isFolderPickerBusyError(e)) {
      throw e;
    }
    if (withId.id && shouldRetryDirectoryPickerWithoutId(e, true)) {
      return await window.showDirectoryPicker({ mode: 'readwrite' });
    }
    throw e;
  }
}

const API_BASE = import.meta.env.VITE_PRIMITIVES_API || '/api';
const PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

let apiChecked = false;
let apiAvailable = false;

export async function isPreviewApiAvailable() {
  if (apiChecked) return apiAvailable;
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    apiAvailable = data.ok === true;
  } catch {
    apiAvailable = false;
  }
  apiChecked = true;
  return apiAvailable;
}

export async function fetchPreviewBlob(cacheKey) {
  const res = await fetch(`${API_BASE}/canvas/previews/${encodeURIComponent(cacheKey)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load preview from server');
  const blob = await res.blob();
  return blob;
}

export async function uploadPreviewBlob(cacheKey, projectId, blob) {
  if (blob.size > PREVIEW_MAX_BYTES) return;
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const data = btoa(binary);
  const res = await fetch(`${API_BASE}/canvas/previews/${encodeURIComponent(cacheKey)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      projectId,
      contentType: blob.type || 'application/octet-stream',
      data,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Preview upload failed');
  }
}

export async function deletePreviewBlobsForProjectRemote(projectId) {
  const params = new URLSearchParams({ projectId });
  const res = await fetch(`${API_BASE}/canvas/previews?${params}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Preview delete failed');
  }
}

/** @param {string} cacheKey e.g. projectId:cardKey:v1 */
export function projectIdFromCacheKey(cacheKey) {
  const i = cacheKey.indexOf(':');
  return i > 0 ? cacheKey.slice(0, i) : '';
}

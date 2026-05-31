function resolveSpecApiBase() {
  const base =
    import.meta.env.VITE_PRIMITIVES_API
    || import.meta.env.VITE_API_URL
    || '/api';
  if (base.startsWith('http')) return base;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${base.startsWith('/') ? base : `/${base}`}`;
  }
  return 'http://localhost:3001';
}

const API_BASE = resolveSpecApiBase();

/**
 * @param {string} projectId
 */
export async function fetchSpecCanvasState(projectId) {
  const res = await fetch(`${API_BASE}/canvas/projects/${projectId}/spec-canvas`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

/**
 * @param {string} projectId
 * @param {{ layout: object, viewport: object }} body
 * @param {number} expectedVersion
 */
export async function saveSpecCanvasState(projectId, body, expectedVersion = 0) {
  const res = await fetch(`${API_BASE}/canvas/projects/${projectId}/spec-canvas`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, expectedVersion }),
  });
  if (res.status === 409) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, conflict: true, version: data.version };
  }
  if (!res.ok) return { ok: false };
  return res.json();
}

/**
 * @param {string} resourceId
 */
export async function fetchSpecResource(resourceId) {
  const res = await fetch(`${API_BASE}/spec/resources/${resourceId}`);
  if (!res.ok) return null;
  return res.json();
}

/**
 * @param {string} projectId
 * @param {string} resourceId
 * @param {object} body
 */
export async function detachSpecResource(projectId, resourceId, body) {
  const res = await fetch(
    `${API_BASE}/canvas/projects/${projectId}/spec-resources/${resourceId}/detach`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error };
  }
  return res.json();
}

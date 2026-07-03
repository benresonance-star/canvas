import { resolveApiBase } from './apiBase.js';
import { BOOT_API_REQUEST_TIMEOUT_MS } from './bootSync.js';

const API_BASE = resolveApiBase();
const READ_REQUEST_TIMEOUT_MS = BOOT_API_REQUEST_TIMEOUT_MS;
const WRITE_REQUEST_TIMEOUT_MS = 30_000;

async function request(path, options = {}) {
  const timeoutMs = options.timeoutMs ?? READ_REQUEST_TIMEOUT_MS;
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
    signal: AbortSignal.timeout(timeoutMs),
    ...fetchOptions,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'API error');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * @param {string} specVersion
 */
export async function fetchConcentrateLayouts(specVersion) {
  const data = await request(
    `/canvas/diagnostics/concentrate-layouts?specVersion=${encodeURIComponent(specVersion)}`,
  );
  return data.layouts ?? [];
}

/**
 * @param {string} actionId
 * @param {string} specVersion
 */
export async function fetchConcentrateLayout(actionId, specVersion) {
  try {
    return await request(
      `/canvas/diagnostics/concentrate-layouts/${encodeURIComponent(actionId)}?specVersion=${encodeURIComponent(specVersion)}`,
    );
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * @param {string} actionId
 * @param {string} specVersion
 * @param {{ nodeOverrides: object, edgeAnchors: object }} body
 */
export async function saveConcentrateLayout(actionId, specVersion, body) {
  return request(
    `/canvas/diagnostics/concentrate-layouts/${encodeURIComponent(actionId)}`,
    {
      method: 'PUT',
      timeoutMs: WRITE_REQUEST_TIMEOUT_MS,
      body: JSON.stringify({
        specVersion,
        nodeOverrides: body.nodeOverrides ?? {},
        edgeAnchors: body.edgeAnchors ?? {},
      }),
    },
  );
}

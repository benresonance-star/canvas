import { formatFetchError } from './openaiFetchErrors.js';

const OPENAI_ORIGIN = 'https://api.openai.com';
const REACHABILITY_TIMEOUT_MS = 8_000;
const CHAT_TIMEOUT_MS = 60_000;

let cachedProxyUrl = null;
/** @type {import('undici').ProxyAgent | null} */
let cachedProxyAgent = null;

function resolveProxyUrl() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null
  );
}

async function getUndici() {
  return import('node:undici');
}

async function getProxyDispatcher() {
  const proxyUrl = resolveProxyUrl();
  if (!proxyUrl) return undefined;
  if (cachedProxyUrl !== proxyUrl) {
    const { ProxyAgent } = await getUndici();
    cachedProxyUrl = proxyUrl;
    cachedProxyAgent = new ProxyAgent(proxyUrl);
  }
  return cachedProxyAgent;
}

/**
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} init
 */
export async function fetchOpenAI(url, init = {}) {
  const { timeoutMs = CHAT_TIMEOUT_MS, ...rest } = init;
  const signal = rest.signal ?? AbortSignal.timeout(timeoutMs);
  const proxyUrl = resolveProxyUrl();

  try {
    if (proxyUrl) {
      const { fetch: undiciFetch } = await getUndici();
      const dispatcher = await getProxyDispatcher();
      return await undiciFetch(url, { ...rest, signal, dispatcher });
    }
    return await fetch(url, { ...rest, signal });
  } catch (e) {
    throw formatFetchError(e);
  }
}

/**
 * Quick connectivity probe (no API key).
 * @returns {Promise<{ reachable: boolean, error?: string }>}
 */
export async function checkOpenaiReachable() {
  try {
    const res = await fetchOpenAI(`${OPENAI_ORIGIN}/`, {
      method: 'HEAD',
      timeoutMs: REACHABILITY_TIMEOUT_MS,
    });
    return { reachable: res.status > 0 };
  } catch (e) {
    const message = e?.message || 'Cannot reach OpenAI';
    console.warn('[agent] OpenAI reachability check failed:', message);
    return { reachable: false, error: message };
  }
}

export { formatFetchError } from './openaiFetchErrors.js';

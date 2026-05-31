function resolveProxyUrl() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null
  );
}

/**
 * @param {unknown} err
 */
export function formatFetchError(err) {
  const cause = err?.cause ?? err;
  const code = cause?.code;
  const hostname = cause?.hostname || 'api.openai.com';

  if (err?.name === 'TimeoutError' || code === 'ABORT_ERR') {
    return new Error('OpenAI request timed out after 60 seconds.');
  }

  const codeSuffix = code ? ` (${code})` : '';

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return new Error(
      `Cannot reach OpenAI${codeSuffix}. Check internet, firewall, or DNS for ${hostname}.`,
    );
  }
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    return new Error(
      `Cannot connect to OpenAI${codeSuffix}. Check firewall or proxy settings.`,
    );
  }
  if (
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'CERT_HAS_EXPIRED' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
  ) {
    return new Error(
      `TLS error reaching OpenAI${codeSuffix}. Office networks often intercept HTTPS — ask IT for HTTPS_PROXY or set NODE_EXTRA_CA_CERTS to your company root certificate file, then restart the API server.`,
    );
  }

  const proxyUrl = resolveProxyUrl();
  if (!proxyUrl && (err?.message === 'fetch failed' || cause?.message === 'fetch failed')) {
    return new Error(
      `Cannot reach OpenAI${codeSuffix}. Check internet, VPN, firewall, or set HTTPS_PROXY and restart the API server.`,
    );
  }

  const base = err?.message || cause?.message || 'OpenAI request failed';
  return new Error(
    proxyUrl
      ? `${base}${codeSuffix} (using proxy ${proxyUrl})`
      : `${base}${codeSuffix}`,
  );
}

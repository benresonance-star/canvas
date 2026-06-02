/**
 * Append Chrome / Adobe PDF Open Parameters so embedded iframes show the native toolbar.
 * @param {string | null | undefined} url
 * @returns {string | null | undefined}
 */
export function pdfEmbedSrc(url) {
  if (!url || typeof url !== 'string') return url;
  const base = url.split('#')[0];
  return `${base}#toolbar=1&navpanes=1&view=FitH`;
}

const PREVIEW_BASE = '<base href="about:srcdoc">';

const INTERNAL_LINK_SCRIPT = `<script>
(() => {
  document.addEventListener('click', (event) => {
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    event.preventDefault();
    const rawTarget = href.slice(1);
    if (!rawTarget) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    let id = rawTarget;
    try {
      id = decodeURIComponent(rawTarget);
    } catch {
      id = rawTarget;
    }
    const target =
      document.getElementById(id)
      || Array.from(document.getElementsByName(id))[0];
    if (target?.scrollIntoView) {
      target.scrollIntoView({ block: 'start', inline: 'nearest' });
    }
    try {
      history.replaceState(null, '', '#' + encodeURIComponent(id));
    } catch {
      // Hash updates are cosmetic; scrolling is the important part.
    }
  }, true);
})();
</script>`;

function injectIntoHead(html, injection) {
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(?:\s[^>]*)?>/i, (match) => `${match}\n${injection}`);
  }
  if (/<html(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<html(?:\s[^>]*)?>/i, (match) => `${match}\n<head>${injection}</head>`);
  }
  return `<!doctype html><html><head>${injection}</head><body>${html}</body></html>`;
}

export function buildHtmlPreviewSrcDoc(html, { interceptInternalLinks = false } = {}) {
  const body = String(html ?? '');
  const injection = interceptInternalLinks
    ? `${PREVIEW_BASE}\n${INTERNAL_LINK_SCRIPT}`
    : PREVIEW_BASE;
  return injectIntoHead(body, injection);
}

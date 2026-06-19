import hljs from 'highlight.js';

const EXTENSION_LANGUAGE = {
  cjs: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeExtension(value) {
  return String(value ?? '')
    .trim()
    .replace(/^\./, '')
    .toLowerCase();
}

function extensionFromFilename(filename) {
  const normalized = String(filename ?? '').trim().toLowerCase();
  const idx = normalized.lastIndexOf('.');
  return idx >= 0 ? normalized.slice(idx + 1) : '';
}

export function resolveCodeLanguage({ language, filename, ext } = {}) {
  const explicit = String(language ?? '').trim().toLowerCase();
  if (explicit && hljs.getLanguage(explicit)) return explicit;
  const resolvedExt = normalizeExtension(ext) || extensionFromFilename(filename);
  return EXTENSION_LANGUAGE[resolvedExt] ?? null;
}

export function highlightCode(content, options = {}) {
  const code = String(content ?? '');
  const language = resolveCodeLanguage(options);
  if (!language || !hljs.getLanguage(language)) {
    return {
      html: escapeHtml(code),
      language,
      highlighted: false,
    };
  }

  try {
    const result = hljs.highlight(code, {
      language,
      ignoreIllegals: true,
    });
    return {
      html: result.value,
      language: result.language ?? language,
      highlighted: true,
    };
  } catch {
    return {
      html: escapeHtml(code),
      language,
      highlighted: false,
    };
  }
}

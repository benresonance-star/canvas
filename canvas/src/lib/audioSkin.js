export const AUDIO_SKIN_STORAGE_KEY = 'canvas:audio-skin';

/** Curated swatches that work on the canvas (mostly dark / muted). */
export const AUDIO_SKIN_PRESETS = [
  '#1a1a2e',
  '#16213e',
  '#0f3460',
  '#1b262c',
  '#2d132c',
  '#1e2a22',
  '#2c1810',
  '#1f1f1f',
  '#2b2d42',
  '#3d405b',
  '#4a4e69',
  '#6b705c',
];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeAudioSkinColor(value) {
  if (value == null || value === '') return null;
  let hex = String(value).trim().toLowerCase();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  const m = hex.match(HEX_RE);
  if (!m) return null;
  if (m[1].length === 3) {
    const [r, g, b] = m[1];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return `#${m[1]}`;
}

function parseRgb(hex) {
  const n = normalizeAudioSkinColor(hex);
  if (!n) return null;
  const h = n.slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** True when background is light enough that dark text is needed. */
export function audioSkinUsesDarkText(hex) {
  const rgb = parseRgb(hex);
  if (!rgb) return false;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.58;
}

export function loadAudioSkinPrefs() {
  try {
    const raw = localStorage.getItem(AUDIO_SKIN_STORAGE_KEY);
    if (!raw) return { favorites: [], defaultColor: null };
    const parsed = JSON.parse(raw);
    const favorites = Array.isArray(parsed.favorites)
      ? [...new Set(parsed.favorites.map(normalizeAudioSkinColor).filter(Boolean))]
      : [];
    const defaultColor = normalizeAudioSkinColor(parsed.defaultColor);
    return { favorites, defaultColor };
  } catch {
    return { favorites: [], defaultColor: null };
  }
}

export function saveAudioSkinPrefs(prefs) {
  const favorites = [...new Set((prefs.favorites || []).map(normalizeAudioSkinColor).filter(Boolean))];
  const defaultColor = normalizeAudioSkinColor(prefs.defaultColor);
  localStorage.setItem(
    AUDIO_SKIN_STORAGE_KEY,
    JSON.stringify({ favorites, defaultColor }),
  );
  return { favorites, defaultColor };
}

export function getDefaultAudioSkinColor() {
  return loadAudioSkinPrefs().defaultColor;
}

export function resolveAudioSkinColor(card) {
  const explicit = normalizeAudioSkinColor(card?.audioSkinColor);
  if (explicit) return explicit;
  return getDefaultAudioSkinColor();
}

export function addFavoriteColor(color) {
  const c = normalizeAudioSkinColor(color);
  if (!c) return loadAudioSkinPrefs();
  const prefs = loadAudioSkinPrefs();
  if (!prefs.favorites.includes(c)) prefs.favorites.push(c);
  return saveAudioSkinPrefs(prefs);
}

export function removeFavoriteColor(color) {
  const c = normalizeAudioSkinColor(color);
  const prefs = loadAudioSkinPrefs();
  prefs.favorites = prefs.favorites.filter((f) => f !== c);
  return saveAudioSkinPrefs(prefs);
}

export function setDefaultAudioSkinColor(color) {
  const prefs = loadAudioSkinPrefs();
  prefs.defaultColor = normalizeAudioSkinColor(color);
  return saveAudioSkinPrefs(prefs);
}

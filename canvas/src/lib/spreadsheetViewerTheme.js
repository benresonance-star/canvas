const DARK_THEMES = new Set(['dark', 'green', 'blue']);

function parseCssColor(color) {
  const value = String(color || '').trim();
  if (!value) return null;

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      return hex.split('').map((ch) => parseInt(ch + ch, 16));
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    return null;
  }

  const rgbMatch = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }

  return null;
}

function relativeLuminance(rgb) {
  const channels = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function resolveSpreadsheetViewerIsDark(root = document.documentElement) {
  const previewBg = getComputedStyle(root).getPropertyValue('--color-preview-bg').trim();
  const rgb = parseCssColor(previewBg);
  if (!rgb) return false;
  return relativeLuminance(rgb) < 0.45;
}

/** @deprecated Prefer resolveSpreadsheetViewerIsDark(root) for palette-accurate surfaces. */
export function resolveSpreadsheetViewerTheme(appTheme, { inCard = false } = {}) {
  if (appTheme === 'light') return false;
  if (appTheme === 'dark') return true;
  if (appTheme === 'green' || appTheme === 'blue') {
    return !inCard;
  }
  return DARK_THEMES.has(appTheme);
}

export function spreadsheetSelectionColors(root = document.documentElement) {
  const styles = getComputedStyle(root);
  const accent = styles.getPropertyValue('--color-accent').trim() || '#b45309';
  const accentHover = styles.getPropertyValue('--color-accent-hover').trim() || '#92400e';
  return {
    selectionColor: accent,
    selectionFillColor: `${accent}1f`,
    selectionHeaderColor: accentHover,
  };
}

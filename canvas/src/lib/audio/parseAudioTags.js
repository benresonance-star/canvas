import jsmediatags from 'jsmediatags';

function pickTag(tags, key) {
  const v = tags?.[key];
  if (v == null) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t || undefined;
  }
  if (typeof v === 'object' && v.data != null) {
    const t = String(v.data).trim();
    return t || undefined;
  }
  return undefined;
}

function pickNumber(tags, key) {
  const raw = pickTag(tags, key);
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse "Artist - Title.ext" or "Title.ext" from a filename (no path).
 */
export function titleFromFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const sep = base.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (sep) {
    return {
      artist: sep[1].trim() || undefined,
      title: sep[2].trim() || undefined,
    };
  }
  return { title: base.trim() || undefined, artist: undefined };
}

function readId3Tags(file) {
  return new Promise((resolve) => {
    jsmediatags.read(file, {
      onSuccess: (tag) => resolve(tag?.tags ?? null),
      onError: () => resolve(null),
    });
  });
}

/**
 * @param {File} file
 * @param {{ fallbackTitle?: string }} [options]
 * @returns {Promise<{
 *   title?: string,
 *   artist?: string,
 *   album?: string,
 *   durationSec?: number,
 *   genre?: string,
 *   year?: string,
 *   track?: string,
 * }>}
 */
export async function parseAudioTags(file, options = {}) {
  const fromName = titleFromFilename(file.name);
  const meta = {};

  const tags = await readId3Tags(file);
  if (tags) {
    const title = pickTag(tags, 'title');
    const artist = pickTag(tags, 'artist');
    const album = pickTag(tags, 'album');
    const genre = pickTag(tags, 'genre');
    const year = pickTag(tags, 'year');
    const track = pickTag(tags, 'track');
    const durationMs = tags.length;

    if (title) meta.title = title;
    if (artist) meta.artist = artist;
    if (album) meta.album = album;
    if (genre) meta.genre = genre;
    if (year != null) meta.year = String(year);
    if (track != null) meta.track = String(track);
    if (typeof durationMs === 'number' && durationMs > 0) {
      meta.durationSec = durationMs / 1000;
    }
  }

  if (!meta.title) meta.title = fromName.title ?? options.fallbackTitle;
  if (!meta.artist) meta.artist = fromName.artist;

  if (!meta.title && options.fallbackTitle) meta.title = options.fallbackTitle;

  return meta;
}

export function formatDurationSec(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

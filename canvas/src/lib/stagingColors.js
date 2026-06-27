import { normalizeCardType } from './filename.js';

/** Distinct fill colors for staged sync chips by card type */
const STAGING_COLOR_BY_TYPE = {
  image: '#3b82f6',
  markdown: '#8b5cf6',
  code: '#38bdf8',
  note: '#8b5cf6',
  html: '#06b6d4',
  pdf: '#ef4444',
  video: '#f97316',
  audio: '#22c55e',
  spreadsheet: '#14b8a6',
  user_note: '#eab308',
  user_task: '#ea580c',
  bookmark: '#f472b6',
  agent_chat: '#a78bfa',
  live: '#0ea5e9',
  agent: '#7c3aed',
  'music-agent': '#db2777',
  sonic_studio: '#059669',
  flow: '#d97706',
  file: '#64748b',
};

export function getStagingColorForType(type) {
  const key = normalizeCardType(type);
  return STAGING_COLOR_BY_TYPE[key] ?? STAGING_COLOR_BY_TYPE.file;
}

/**
 * Muted border/background tints for list rows (e.g. exploration artifact palette).
 * Derived from the same palette as sync dock chips.
 */
export function getMutedStagingStyleForType(type) {
  const base = getStagingColorForType(type);
  return {
    borderColor: `color-mix(in srgb, ${base} 21%, var(--color-border))`,
    backgroundColor: `color-mix(in srgb, ${base} 6%, var(--color-canvas))`,
  };
}

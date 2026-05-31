/** Distinct fill colors for staged sync chips by card type */
const STAGING_COLOR_BY_TYPE = {
  image: '#3b82f6',
  markdown: '#8b5cf6',
  note: '#8b5cf6',
  html: '#06b6d4',
  pdf: '#ef4444',
  video: '#f97316',
  audio: '#22c55e',
  spreadsheet: '#14b8a6',
  user_note: '#eab308',
  bookmark: '#f472b6',
  agent_chat: '#a78bfa',
  file: '#64748b',
};

export function getStagingColorForType(type) {
  return STAGING_COLOR_BY_TYPE[type] ?? STAGING_COLOR_BY_TYPE.file;
}

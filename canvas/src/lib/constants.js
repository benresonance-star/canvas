/** @deprecated Legacy single-project key; migrated into canvas:project-index */
export const LEGACY_PROJECT_KEY = 'canvas:default-project';
export const PROJECT_INDEX_KEY = 'canvas:project-index';
export const LOCAL_ACTIVE_PROJECT_ID_KEY = 'canvas:active-project-id';

export function projectStorageKey(projectId) {
  return `canvas:project:${projectId}`;
}

export function agentChatStorageKey(projectId, connectorId, threadId) {
  if (threadId) {
    return `canvas:agent-chat:${projectId}:${connectorId}:${threadId}`;
  }
  return `canvas:agent-chat:${projectId}:${connectorId}`;
}

export function agentChatThreadIndexStorageKey(projectId, connectorId) {
  return `canvas:agent-chat-threads:${projectId}:${connectorId}`;
}

/** Soft limit for serialized agent chat session JSON in localStorage */
export const AGENT_CHAT_STORAGE_SOFT_BYTES = 3 * 1024 * 1024;
export const THEME_STORAGE_KEY = 'canvas:theme';
export const THEME_CYCLE = ['light', 'dark', 'green', 'blue'];
export const ARTIFACT_SIDEBAR_STORAGE_KEY = 'canvas:artifact-sidebar-open';
/** Max file size (bytes) to load fully as text or base64 dataUrl */
export const STORAGE_LIMIT = 4 * 1024 * 1024; // 4MB safety margin under 5MB limit
/** Serialized project JSON above this triggers aggressive slimming (~browser localStorage quota) */
export const PROJECT_JSON_SOFT_LIMIT = 4 * 1024 * 1024;
/** Start proactive slimming when serialised size exceeds this (before quota errors) */
export const PROJECT_JSON_TRIM_TARGET = 3 * 1024 * 1024;
/** Phase 3: persist layout + refs only (folder/API hydrate on load) */
export const SLIM_PROJECT_PERSIST_ENABLED = true;
/** In-session preview max bytes for image/PDF; over STORAGE_LIMIT uses blob URL only until re-sync */
export const PREVIEW_MAX_BYTES_IMAGE_PDF = 32 * 1024 * 1024;
/** dataUrl strings longer than this are omitted from localStorage (~4MB raw file as base64) */
export const DATA_URL_PERSIST_MAX_CHARS = 5_500_000;
/** Very long data: URLs often render as a blank PDF in iframes; use a blob URL for display above this length */
export const PDF_IFRAME_DATA_URL_MAX_CHARS = 1_200_000;

/** Min/max card dimensions when resizing on the canvas (px). */
export const CARD_RESIZE_MIN_W = 120;
export const CARD_RESIZE_MIN_H = 80;
export const CARD_RESIZE_MAX_W = 1920;
export const CARD_RESIZE_MAX_H = 1440;

export const CARD_TYPE_DEFAULT_SIZE = {
  note: { w: 280, h: 180 },
  markdown: { w: 280, h: 180 },
  user_note: { w: 300, h: 200 },
  image: { w: 280, h: 220 },
  html: { w: 320, h: 220 },
  pdf: { w: 280, h: 320 },
  video: { w: 320, h: 200 },
  audio: { w: 320, h: 140 },
  spreadsheet: { w: 320, h: 240 },
  bookmark: { w: 280, h: 200 },
  agent_chat: { w: 360, h: 280 },
  file: { w: 240, h: 140 },
};

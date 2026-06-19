import { flowAgentUiStorageKey } from './constants.js';

export const FLOW_AGENT_UI_VERSION = 1;

/** @typedef {{ setupCollapsed?: boolean, contextCollapsed?: boolean }} FlowAgentPanelLayout */

/** @typedef {{ activeThreadId?: string | null, connectorId?: string | null, panelLayout?: FlowAgentPanelLayout }} FlowAgentUiEntry */

/**
 * @returns {{ version: number, byFlowCardId: Record<string, FlowAgentUiEntry> }}
 */
export function emptyFlowAgentUiStore() {
  return { version: FLOW_AGENT_UI_VERSION, byFlowCardId: {} };
}

/**
 * @param {unknown} data
 * @returns {{ version: number, byFlowCardId: Record<string, FlowAgentUiEntry> }}
 */
function parseFlowAgentUiStore(data) {
  if (!data || typeof data !== 'object' || data.version !== FLOW_AGENT_UI_VERSION) {
    return emptyFlowAgentUiStore();
  }
  const byFlowCardId = data.byFlowCardId && typeof data.byFlowCardId === 'object'
    ? { ...data.byFlowCardId }
    : {};
  return { version: FLOW_AGENT_UI_VERSION, byFlowCardId };
}

function readFlowAgentUiStore(projectId) {
  if (!projectId) return emptyFlowAgentUiStore();
  try {
    const raw = localStorage.getItem(flowAgentUiStorageKey(projectId));
    if (!raw) return emptyFlowAgentUiStore();
    return parseFlowAgentUiStore(JSON.parse(raw));
  } catch {
    return emptyFlowAgentUiStore();
  }
}

function writeFlowAgentUiStore(projectId, store) {
  if (!projectId) return;
  try {
    localStorage.setItem(flowAgentUiStorageKey(projectId), JSON.stringify(store));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * @param {FlowAgentPanelLayout | null | undefined} layout
 * @returns {{ setup: boolean, context: boolean }}
 */
export function flowAgentPanelLayoutToCollapsedSections(layout) {
  return {
    setup: Boolean(layout?.setupCollapsed),
    context: Boolean(layout?.contextCollapsed),
  };
}

/**
 * @param {{ setup?: boolean, context?: boolean }} sections
 * @returns {FlowAgentPanelLayout}
 */
export function collapsedSectionsToFlowAgentPanelLayout(sections) {
  return {
    setupCollapsed: Boolean(sections?.setup),
    contextCollapsed: Boolean(sections?.context),
  };
}

/**
 * @param {string | null | undefined} projectId
 * @param {string | null | undefined} flowCardId
 * @returns {FlowAgentUiEntry | null}
 */
export function readFlowAgentUiState(projectId, flowCardId) {
  if (!projectId || !flowCardId) return null;
  const store = readFlowAgentUiStore(projectId);
  const entry = store.byFlowCardId[flowCardId];
  if (!entry || typeof entry !== 'object') return null;
  return { ...entry };
}

/**
 * @param {{
 *   activeThreadId?: string | null,
 *   connectorId?: string | null,
 *   panelLayout?: FlowAgentPanelLayout,
 * }} params
 * @returns {FlowAgentUiEntry}
 */
export function buildFlowAgentUiSnapshot({
  activeThreadId = null,
  connectorId = null,
  panelLayout = null,
} = {}) {
  const snapshot = {
    activeThreadId: activeThreadId ?? null,
    connectorId: connectorId ?? null,
  };
  if (panelLayout && typeof panelLayout === 'object') {
    snapshot.panelLayout = {
      setupCollapsed: Boolean(panelLayout.setupCollapsed),
      contextCollapsed: Boolean(panelLayout.contextCollapsed),
    };
  }
  return snapshot;
}

/**
 * @param {string | null | undefined} projectId
 * @param {string | null | undefined} flowCardId
 * @param {FlowAgentUiEntry} partial
 */
export function writeFlowAgentUiState(projectId, flowCardId, partial) {
  if (!projectId || !flowCardId || !partial || typeof partial !== 'object') return;
  const store = readFlowAgentUiStore(projectId);
  const prev = store.byFlowCardId[flowCardId] ?? {};
  const nextEntry = { ...prev, ...partial };
  if (partial.panelLayout && typeof partial.panelLayout === 'object') {
    nextEntry.panelLayout = {
      ...(prev.panelLayout ?? {}),
      ...partial.panelLayout,
    };
  }
  store.byFlowCardId[flowCardId] = nextEntry;
  writeFlowAgentUiStore(projectId, store);
}

/**
 * @param {string | null | undefined} projectId
 * @param {string | null | undefined} flowCardId
 */
export function clearFlowAgentUiState(projectId, flowCardId) {
  if (!projectId || !flowCardId) return;
  const store = readFlowAgentUiStore(projectId);
  if (!store.byFlowCardId[flowCardId]) return;
  delete store.byFlowCardId[flowCardId];
  writeFlowAgentUiStore(projectId, store);
}

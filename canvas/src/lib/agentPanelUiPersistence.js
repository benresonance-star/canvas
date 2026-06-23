import { agentPanelUiStorageKey } from './constants.js';
import {
  collapsedSectionsToFlowAgentPanelLayout,
  flowAgentPanelLayoutToCollapsedSections,
} from './flowAgentUiPersistence.js';

export const AGENT_PANEL_UI_VERSION = 1;

/** @typedef {{ setupCollapsed?: boolean, contextCollapsed?: boolean }} AgentPanelLayout */

/**
 * @typedef {{
 *   connectorId?: string | null,
 *   activeThreadId?: string | null,
 *   activeAgentTemplateId?: string | null,
 *   panelLayout?: AgentPanelLayout,
 * }} AgentPanelUiState
 */

/**
 * @returns {AgentPanelUiState}
 */
export function emptyAgentPanelUiState() {
  return {
    connectorId: null,
    activeThreadId: null,
    activeAgentTemplateId: null,
    panelLayout: {
      setupCollapsed: false,
      contextCollapsed: false,
    },
  };
}

/**
 * @param {unknown} data
 * @returns {AgentPanelUiState}
 */
function parseAgentPanelUiState(data) {
  if (!data || typeof data !== 'object' || data.version !== AGENT_PANEL_UI_VERSION) {
    return emptyAgentPanelUiState();
  }
  const panelLayout = data.panelLayout && typeof data.panelLayout === 'object'
    ? {
      setupCollapsed: Boolean(data.panelLayout.setupCollapsed),
      contextCollapsed: Boolean(data.panelLayout.contextCollapsed),
    }
    : emptyAgentPanelUiState().panelLayout;
  return {
    connectorId: typeof data.connectorId === 'string' ? data.connectorId : null,
    activeThreadId: typeof data.activeThreadId === 'string' ? data.activeThreadId : null,
    activeAgentTemplateId: typeof data.activeAgentTemplateId === 'string'
      ? data.activeAgentTemplateId
      : null,
    panelLayout,
  };
}

/**
 * @param {string | null | undefined} projectId
 * @returns {AgentPanelUiState}
 */
export function readAgentPanelUiState(projectId) {
  if (!projectId) return emptyAgentPanelUiState();
  try {
    const raw = localStorage.getItem(agentPanelUiStorageKey(projectId));
    if (!raw) return emptyAgentPanelUiState();
    return parseAgentPanelUiState(JSON.parse(raw));
  } catch {
    return emptyAgentPanelUiState();
  }
}

/**
 * @param {{
 *   connectorId?: string | null,
 *   activeThreadId?: string | null,
 *   activeAgentTemplateId?: string | null,
 *   panelLayout?: AgentPanelLayout | null,
 * }} params
 * @returns {AgentPanelUiState}
 */
export function buildAgentPanelUiSnapshot({
  connectorId = null,
  activeThreadId = null,
  activeAgentTemplateId = null,
  panelLayout = null,
} = {}) {
  const snapshot = {
    connectorId: connectorId ?? null,
    activeThreadId: activeThreadId ?? null,
    activeAgentTemplateId: activeAgentTemplateId ?? null,
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
 * @param {Partial<AgentPanelUiState>} partial
 */
export function writeAgentPanelUiState(projectId, partial) {
  if (!projectId || !partial || typeof partial !== 'object') return;
  const prev = readAgentPanelUiState(projectId);
  const next = {
    version: AGENT_PANEL_UI_VERSION,
    connectorId: partial.connectorId !== undefined ? partial.connectorId : prev.connectorId,
    activeThreadId: partial.activeThreadId !== undefined
      ? partial.activeThreadId
      : prev.activeThreadId,
    activeAgentTemplateId: partial.activeAgentTemplateId !== undefined
      ? partial.activeAgentTemplateId
      : prev.activeAgentTemplateId,
    panelLayout: partial.panelLayout
      ? {
        ...(prev.panelLayout ?? {}),
        ...partial.panelLayout,
      }
      : prev.panelLayout,
  };
  try {
    localStorage.setItem(agentPanelUiStorageKey(projectId), JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
}

export { flowAgentPanelLayoutToCollapsedSections, collapsedSectionsToFlowAgentPanelLayout };

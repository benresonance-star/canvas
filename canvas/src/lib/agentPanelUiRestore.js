import {
  flowAgentPanelLayoutToCollapsedSections,
  collapsedSectionsToFlowAgentPanelLayout,
} from './flowAgentUiPersistence.js';

/**
 * @typedef {import('./agentPanelUiPersistence.js').AgentPanelUiState} AgentPanelUiState
 */

/**
 * Plans workspace dock agent panel restore on project load or panel open.
 *
 * @param {AgentPanelUiState | null | undefined} stored
 * @param {string | null | undefined} globalConnectorId
 * @returns {{
 *   collapsedSections: { setup: boolean, context: boolean } | null,
 *   pendingThreadRestore: { threadId: string, connectorId: string | null } | null,
 *   connectorIdToSwitch: string | null,
 *   restoreComplete: boolean,
 * }}
 */
export function planAgentPanelUiRestore(stored, globalConnectorId = null) {
  const collapsedSections = stored?.panelLayout
    ? flowAgentPanelLayoutToCollapsedSections(stored.panelLayout)
    : null;

  if (!stored?.activeThreadId) {
    return {
      collapsedSections,
      pendingThreadRestore: null,
      connectorIdToSwitch: null,
      restoreComplete: true,
    };
  }

  const connectorId = stored.connectorId ?? globalConnectorId ?? null;
  const connectorIdToSwitch = (
    stored.connectorId
    && stored.connectorId !== globalConnectorId
  )
    ? stored.connectorId
    : null;

  return {
    collapsedSections,
    pendingThreadRestore: {
      threadId: stored.activeThreadId,
      connectorId,
    },
    connectorIdToSwitch,
    restoreComplete: false,
  };
}

/**
 * @param {boolean} restoreComplete
 * @returns {boolean}
 */
export function shouldAutoPersistWorkspaceAgentThread(restoreComplete) {
  return restoreComplete;
}

/**
 * @param {{
 *   collapsedSections: { setup?: boolean, context?: boolean },
 *   activeThreadId?: string | null,
 *   connectorId?: string | null,
 *   activeAgentTemplateId?: string | null,
 * }} params
 * @returns {import('./agentPanelUiPersistence.js').AgentPanelUiState}
 */
export function buildAgentPanelUiFlushPayload({
  collapsedSections,
  activeThreadId = null,
  connectorId = null,
  activeAgentTemplateId = null,
}) {
  const payload = {
    panelLayout: collapsedSectionsToFlowAgentPanelLayout(collapsedSections),
    activeAgentTemplateId: activeAgentTemplateId ?? null,
  };
  if (activeThreadId) {
    payload.activeThreadId = activeThreadId;
    payload.connectorId = connectorId ?? null;
  } else if (connectorId) {
    payload.connectorId = connectorId;
  }
  return payload;
}

import {
  flowAgentPanelLayoutToCollapsedSections,
  collapsedSectionsToFlowAgentPanelLayout,
} from './flowAgentUiPersistence.js';

/**
 * @typedef {import('./flowAgentUiPersistence.js').FlowAgentUiEntry} FlowAgentUiEntry
 */

/**
 * Plans the initial restore when agent mode is enabled on a flow card.
 * Does not auto-persist the workspace-global thread over stored per-flow state.
 *
 * @param {FlowAgentUiEntry | null | undefined} stored
 * @param {string | null | undefined} globalConnectorId
 * @returns {{
 *   collapsedSections: { setup: boolean, context: boolean } | null,
 *   pendingThreadRestore: { threadId: string, connectorId: string | null } | null,
 *   connectorIdToSwitch: string | null,
 *   restoreComplete: boolean,
 * }}
 */
export function planFlowAgentUiRestore(stored, globalConnectorId = null) {
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
 * Whether the auto-persist effect may write the workspace-global active thread
 * into per-flow storage (only after restore has finished).
 *
 * @param {boolean} restoreComplete
 * @returns {boolean}
 */
export function shouldAutoPersistFlowAgentThread(restoreComplete) {
  return restoreComplete;
}

/**
 * @param {{
 *   collapsedSections: { setup?: boolean, context?: boolean },
 *   activeThreadId?: string | null,
 *   connectorId?: string | null,
 * }} params
 * @returns {import('./flowAgentUiPersistence.js').FlowAgentUiEntry}
 */
export function buildFlowAgentUiFlushPayload({
  collapsedSections,
  activeThreadId = null,
  connectorId = null,
}) {
  const payload = {
    panelLayout: collapsedSectionsToFlowAgentPanelLayout(collapsedSections),
  };
  if (activeThreadId) {
    payload.activeThreadId = activeThreadId;
    payload.connectorId = connectorId ?? null;
  }
  return payload;
}

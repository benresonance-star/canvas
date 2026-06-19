import { useEffect, useState } from 'react';
import { CONNECTORS } from '../../../lib/agentConnectors.js';
import {
  connectorIdFromAgentChatFilename,
  loadThreadIndex,
  resolveThreadForCard,
} from '../../../lib/agentChatThreads.js';

/**
 * Resolve agent-chat thread index for a canvas card referenced by a flow artifact node.
 * Uses filename-derived connector first, then scans known connectors.
 *
 * @param {object | null | undefined} card
 * @param {string | null | undefined} projectId
 */
export function useFlowAgentChatPreviewContext(card, projectId) {
  const [state, setState] = useState({
    index: null,
    connectorId: null,
    loading: false,
  });

  useEffect(() => {
    if (!card || card.type !== 'agent_chat' || !projectId) {
      setState({ index: null, connectorId: null, loading: false });
      return undefined;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));

    void (async () => {
      const filename = card.versions?.[0]?.filename;
      const connectorFromFilename = connectorIdFromAgentChatFilename(filename);

      if (connectorFromFilename) {
        const index = await loadThreadIndex(projectId, connectorFromFilename);
        if (!cancelled) {
          setState({ index, connectorId: connectorFromFilename, loading: false });
        }
        return;
      }

      for (const connector of CONNECTORS) {
        const index = await loadThreadIndex(projectId, connector.id);
        const thread = resolveThreadForCard(index, card, connector.id);
        if (thread) {
          if (!cancelled) {
            setState({ index, connectorId: connector.id, loading: false });
          }
          return;
        }
      }

      if (!cancelled) {
        setState({
          index: null,
          connectorId: connectorFromFilename ?? CONNECTORS[0]?.id ?? null,
          loading: false,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [card?.id, card?.type, projectId]);

  return state;
}

/**
 * Pure helper for tests — resolve connector id from an agent_chat card filename.
 *
 * @param {object | null | undefined} card
 */
export function resolveAgentChatConnectorIdForCard(card) {
  if (!card || card.type !== 'agent_chat') return null;
  return connectorIdFromAgentChatFilename(card.versions?.[0]?.filename);
}

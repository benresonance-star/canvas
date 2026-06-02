import { useEffect } from 'react';
import { requestActionSync } from '../../lib/projects.js';
import { flushAgentChatSync } from '../../lib/agentChatSync.js';
import { flushAgentChatThreadIndexSync } from '../../lib/agentChatPersistence.js';

/**
 * Coordinated unload flush for project document + agent chat.
 */
export function usePageHideFlush({
  activeProjectIdRef,
  initialHydratedRef,
  activeThreadIdRef,
  agentChatMessagesRef,
  persistAgentChatSessionRef,
  agentContextRegistryRef,
  serializeRegistry,
  singleConnectorId,
}) {
  useEffect(() => {
    const onPageHide = () => {
      const projectId = activeProjectIdRef.current;
      if (!projectId || !initialHydratedRef.current) return;
      void requestActionSync('pagehide', { projectId });
      if (activeThreadIdRef.current) {
        void persistAgentChatSessionRef.current(agentChatMessagesRef.current, {
          projectId,
          threadId: activeThreadIdRef.current,
          registrySerialized: serializeRegistry(agentContextRegistryRef.current),
        });
      }
      void flushAgentChatSync();
      if (singleConnectorId) {
        void flushAgentChatThreadIndexSync(projectId, singleConnectorId);
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [
    activeProjectIdRef,
    initialHydratedRef,
    activeThreadIdRef,
    agentChatMessagesRef,
    persistAgentChatSessionRef,
    agentContextRegistryRef,
    serializeRegistry,
    singleConnectorId,
  ]);
}

import { describe, it, expect } from 'vitest';
import {
  planAgentPanelUiRestore,
  shouldAutoPersistWorkspaceAgentThread,
  buildAgentPanelUiFlushPayload,
} from '../agentPanelUiRestore.js';

describe('agentPanelUiRestore', () => {
  describe('planAgentPanelUiRestore', () => {
    it('returns restoreComplete when no stored thread', () => {
      const plan = planAgentPanelUiRestore({
        panelLayout: { setupCollapsed: true, contextCollapsed: false },
      }, 'openai');

      expect(plan).toEqual({
        collapsedSections: { setup: true, context: false },
        pendingThreadRestore: null,
        connectorIdToSwitch: null,
        restoreComplete: true,
      });
    });

    it('queues stored workspace thread', () => {
      const plan = planAgentPanelUiRestore({
        activeThreadId: 'workspace-thread-a',
        connectorId: 'ollama-gemma-12b',
        panelLayout: { setupCollapsed: false, contextCollapsed: true },
      }, 'openai');

      expect(plan.pendingThreadRestore).toEqual({
        threadId: 'workspace-thread-a',
        connectorId: 'ollama-gemma-12b',
      });
      expect(plan.connectorIdToSwitch).toBe('ollama-gemma-12b');
      expect(plan.restoreComplete).toBe(false);
    });
  });

  describe('buildAgentPanelUiFlushPayload', () => {
    it('includes thread fields only when thread is known', () => {
      expect(buildAgentPanelUiFlushPayload({
        collapsedSections: { setup: false, context: true },
        activeThreadId: 'thread-a',
        connectorId: 'openai',
        activeAgentTemplateId: 'tpl-1',
      })).toEqual({
        panelLayout: { setupCollapsed: false, contextCollapsed: true },
        activeThreadId: 'thread-a',
        connectorId: 'openai',
        activeAgentTemplateId: 'tpl-1',
      });
    });
  });

  describe('shouldAutoPersistWorkspaceAgentThread', () => {
    it('defers auto-persist until restore completes', () => {
      expect(shouldAutoPersistWorkspaceAgentThread(false)).toBe(false);
      expect(shouldAutoPersistWorkspaceAgentThread(true)).toBe(true);
    });
  });
});

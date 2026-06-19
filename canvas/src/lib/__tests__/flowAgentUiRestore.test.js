import { describe, it, expect } from 'vitest';
import {
  planFlowAgentUiRestore,
  shouldAutoPersistFlowAgentThread,
  buildFlowAgentUiFlushPayload,
} from '../flowAgentUiRestore.js';

describe('flowAgentUiRestore', () => {
  describe('planFlowAgentUiRestore', () => {
    it('returns restoreComplete when no stored thread', () => {
      const plan = planFlowAgentUiRestore({
        panelLayout: { setupCollapsed: true, contextCollapsed: false },
      }, 'openai');

      expect(plan).toEqual({
        collapsedSections: { setup: true, context: false },
        pendingThreadRestore: null,
        connectorIdToSwitch: null,
        restoreComplete: true,
      });
    });

    it('queues stored flow thread without using global thread', () => {
      const plan = planFlowAgentUiRestore({
        activeThreadId: 'flow-thread-a',
        connectorId: 'ollama-gemma-12b',
        panelLayout: { setupCollapsed: false, contextCollapsed: true },
      }, 'openai');

      expect(plan.pendingThreadRestore).toEqual({
        threadId: 'flow-thread-a',
        connectorId: 'ollama-gemma-12b',
      });
      expect(plan.connectorIdToSwitch).toBe('ollama-gemma-12b');
      expect(plan.restoreComplete).toBe(false);
      expect(plan.collapsedSections).toEqual({ setup: false, context: true });
    });

    it('falls back to global connector when stored connector is missing', () => {
      const plan = planFlowAgentUiRestore({
        activeThreadId: 'flow-thread-a',
      }, 'openai');

      expect(plan.pendingThreadRestore).toEqual({
        threadId: 'flow-thread-a',
        connectorId: 'openai',
      });
      expect(plan.connectorIdToSwitch).toBeNull();
    });

    it('handles null stored state', () => {
      const plan = planFlowAgentUiRestore(null, 'openai');

      expect(plan).toEqual({
        collapsedSections: null,
        pendingThreadRestore: null,
        connectorIdToSwitch: null,
        restoreComplete: true,
      });
    });
  });

  describe('shouldAutoPersistFlowAgentThread', () => {
    it('defers auto-persist until restore completes', () => {
      expect(shouldAutoPersistFlowAgentThread(false)).toBe(false);
      expect(shouldAutoPersistFlowAgentThread(true)).toBe(true);
    });
  });

  describe('buildFlowAgentUiFlushPayload', () => {
    it('always includes panelLayout', () => {
      expect(buildFlowAgentUiFlushPayload({
        collapsedSections: { setup: true, context: false },
      })).toEqual({
        panelLayout: { setupCollapsed: true, contextCollapsed: false },
      });
    });

    it('includes thread fields only when thread is known', () => {
      expect(buildFlowAgentUiFlushPayload({
        collapsedSections: { setup: false, context: true },
        activeThreadId: 'thread-a',
        connectorId: 'openai',
      })).toEqual({
        panelLayout: { setupCollapsed: false, contextCollapsed: true },
        activeThreadId: 'thread-a',
        connectorId: 'openai',
      });
    });
  });
});

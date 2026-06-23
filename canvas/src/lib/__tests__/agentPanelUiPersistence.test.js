import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { agentPanelUiStorageKey } from '../constants.js';
import {
  readAgentPanelUiState,
  writeAgentPanelUiState,
  buildAgentPanelUiSnapshot,
  flowAgentPanelLayoutToCollapsedSections,
  collapsedSectionsToFlowAgentPanelLayout,
} from '../agentPanelUiPersistence.js';

describe('agentPanelUiPersistence', () => {
  const projectId = 'project-1';

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      store: new Map(),
      getItem(key) {
        return this.store.get(key) ?? null;
      },
      setItem(key, value) {
        this.store.set(key, value);
      },
      removeItem(key) {
        this.store.delete(key);
      },
      clear() {
        this.store.clear();
      },
      key(i) {
        return [...this.store.keys()][i] ?? null;
      },
      get length() {
        return this.store.size;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty state when project id is missing', () => {
    const state = readAgentPanelUiState(null);
    expect(state.connectorId).toBeNull();
    expect(state.panelLayout).toEqual({ setupCollapsed: false, contextCollapsed: false });
  });

  it('round-trips workspace agent panel ui state', () => {
    writeAgentPanelUiState(projectId, {
      connectorId: 'ollama-gemma-12b',
      activeThreadId: 'thread-1',
      activeAgentTemplateId: 'template-1',
      panelLayout: { setupCollapsed: true, contextCollapsed: false },
    });
    const state = readAgentPanelUiState(projectId);
    expect(state.connectorId).toBe('ollama-gemma-12b');
    expect(state.activeThreadId).toBe('thread-1');
    expect(state.activeAgentTemplateId).toBe('template-1');
    expect(state.panelLayout).toEqual({ setupCollapsed: true, contextCollapsed: false });
  });

  it('merges partial writes', () => {
    writeAgentPanelUiState(projectId, {
      connectorId: 'openai',
      panelLayout: { setupCollapsed: false, contextCollapsed: true },
    });
    writeAgentPanelUiState(projectId, { activeAgentTemplateId: 'tpl-2' });
    const state = readAgentPanelUiState(projectId);
    expect(state.connectorId).toBe('openai');
    expect(state.activeAgentTemplateId).toBe('tpl-2');
    expect(state.panelLayout).toEqual({ setupCollapsed: false, contextCollapsed: true });
  });

  it('ignores invalid stored version', () => {
    localStorage.setItem(agentPanelUiStorageKey(projectId), '{"version":99}');
    const state = readAgentPanelUiState(projectId);
    expect(state.connectorId).toBeNull();
  });

  it('maps panel layout to collapsed sections', () => {
    expect(flowAgentPanelLayoutToCollapsedSections({ setupCollapsed: true, contextCollapsed: false }))
      .toEqual({ setup: true, context: false });
    expect(collapsedSectionsToFlowAgentPanelLayout({ setup: true, context: false }))
      .toEqual({ setupCollapsed: true, contextCollapsed: false });
  });

  it('buildAgentPanelUiSnapshot normalizes fields', () => {
    expect(buildAgentPanelUiSnapshot({
      connectorId: 'openai',
      activeThreadId: 'thread-a',
      activeAgentTemplateId: 'a',
      panelLayout: { setupCollapsed: true, contextCollapsed: true },
    })).toEqual({
      connectorId: 'openai',
      activeThreadId: 'thread-a',
      activeAgentTemplateId: 'a',
      panelLayout: { setupCollapsed: true, contextCollapsed: true },
    });
  });
});

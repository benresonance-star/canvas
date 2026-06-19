import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flowAgentUiStorageKey } from '../constants.js';
import {
  readFlowAgentUiState,
  writeFlowAgentUiState,
  clearFlowAgentUiState,
  buildFlowAgentUiSnapshot,
  flowAgentPanelLayoutToCollapsedSections,
  collapsedSectionsToFlowAgentPanelLayout,
} from '../flowAgentUiPersistence.js';

describe('flowAgentUiPersistence', () => {
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

  it('returns null when project or flow card id is missing', () => {
    expect(readFlowAgentUiState(null, 'flow-a')).toBeNull();
    expect(readFlowAgentUiState(projectId, null)).toBeNull();
  });

  it('round-trips per-flow-card state', () => {
    writeFlowAgentUiState(projectId, 'flow-a', {
      activeThreadId: 'thread-a',
      connectorId: 'openai',
      panelLayout: { setupCollapsed: true, contextCollapsed: false },
    });

    const state = readFlowAgentUiState(projectId, 'flow-a');
    expect(state).toEqual({
      activeThreadId: 'thread-a',
      connectorId: 'openai',
      panelLayout: { setupCollapsed: true, contextCollapsed: false },
    });
  });

  it('merges partial updates without clobbering other flow cards', () => {
    writeFlowAgentUiState(projectId, 'flow-a', {
      activeThreadId: 'thread-a',
      connectorId: 'openai',
    });
    writeFlowAgentUiState(projectId, 'flow-b', {
      activeThreadId: 'thread-b',
      connectorId: 'ollama-gemma-12b',
    });
    writeFlowAgentUiState(projectId, 'flow-a', {
      panelLayout: { setupCollapsed: true },
    });

    expect(readFlowAgentUiState(projectId, 'flow-a')).toEqual({
      activeThreadId: 'thread-a',
      connectorId: 'openai',
      panelLayout: { setupCollapsed: true },
    });
    expect(readFlowAgentUiState(projectId, 'flow-b')).toEqual({
      activeThreadId: 'thread-b',
      connectorId: 'ollama-gemma-12b',
    });
  });

  it('clears a single flow card entry', () => {
    writeFlowAgentUiState(projectId, 'flow-a', { activeThreadId: 'thread-a' });
    writeFlowAgentUiState(projectId, 'flow-b', { activeThreadId: 'thread-b' });

    clearFlowAgentUiState(projectId, 'flow-a');

    expect(readFlowAgentUiState(projectId, 'flow-a')).toBeNull();
    expect(readFlowAgentUiState(projectId, 'flow-b')?.activeThreadId).toBe('thread-b');
  });

  it('returns null for invalid stored payloads', () => {
    localStorage.setItem(flowAgentUiStorageKey(projectId), '{"version":99}');
    expect(readFlowAgentUiState(projectId, 'flow-a')).toBeNull();
  });

  it('maps panel layout to collapsed sections', () => {
    expect(flowAgentPanelLayoutToCollapsedSections({ setupCollapsed: true, contextCollapsed: false }))
      .toEqual({ setup: true, context: false });
    expect(collapsedSectionsToFlowAgentPanelLayout({ setup: true, context: false }))
      .toEqual({ setupCollapsed: true, contextCollapsed: false });
  });

  it('buildFlowAgentUiSnapshot normalizes thread and layout fields', () => {
    expect(buildFlowAgentUiSnapshot({
      activeThreadId: 'thread-a',
      connectorId: 'openai',
      panelLayout: { setupCollapsed: true, contextCollapsed: false },
    })).toEqual({
      activeThreadId: 'thread-a',
      connectorId: 'openai',
      panelLayout: { setupCollapsed: true, contextCollapsed: false },
    });
  });
});

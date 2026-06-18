import { describe, expect, it } from 'vitest';
import { buildWorkspaceTree } from '../buildWorkspaceTree.js';
import {
  buildPrimitivePlacementIndex,
  buildPrimitiveSelectionIndex,
  decorateWorkspacePlacement,
  filterWorkspaceEventsToPlacementIndex,
  filterWorkspaceItemsToPlacementIndex,
  primitivePlacementKey,
} from '../workspacePlacementIndex.js';

function artifactCard(id, artifactId, key = 'general__doc') {
  return {
    id,
    key,
    type: 'pdf',
    pinnedVersion: 1,
    versions: [{ version: 1, artifactRef: { id: artifactId, type: 'artifact' } }],
  };
}

describe('buildPrimitivePlacementIndex', () => {
  it('maps artifact on canvas', () => {
    const index = buildPrimitivePlacementIndex({
      cards: [artifactCard('c1', 'art-canvas')],
      stagedSyncCards: [],
    });
    expect(index.get(primitivePlacementKey('artifact', 'art-canvas'))).toBe('canvas');
  });

  it('maps artifact on dock only', () => {
    const index = buildPrimitivePlacementIndex({
      cards: [],
      stagedSyncCards: [artifactCard('s1', 'art-dock')],
    });
    expect(index.get(primitivePlacementKey('artifact', 'art-dock'))).toBe('dock');
  });

  it('prefers canvas when same artifact appears on dock and canvas', () => {
    const index = buildPrimitivePlacementIndex({
      cards: [artifactCard('c1', 'art-both')],
      stagedSyncCards: [artifactCard('s1', 'art-both', 'general__other')],
    });
    expect(index.get(primitivePlacementKey('artifact', 'art-both'))).toBe('canvas');
  });

  it('resolves agent chat via thread artifactRef', () => {
    const index = buildPrimitivePlacementIndex({
      cards: [
        {
          id: 'chat-1',
          key: 'notes__agent',
          type: 'agent_chat',
          versions: [],
        },
      ],
      stagedSyncCards: [],
      threads: [
        {
          threadId: 't1',
          cardId: 'chat-1',
          artifactRef: { id: 'art-chat', type: 'artifact' },
        },
      ],
      connectorId: 'openai',
    });
    expect(index.get(primitivePlacementKey('artifact', 'art-chat'))).toBe('canvas');
  });
});

describe('buildPrimitiveSelectionIndex', () => {
  it('maps primitive keys to canvas cards and card IDs back to primitive keys', () => {
    const index = buildPrimitiveSelectionIndex({
      cards: [artifactCard('c1', 'art-canvas')],
      stagedSyncCards: [artifactCard('s1', 'art-dock')],
    });

    expect(index.byPrimitiveKey.get(primitivePlacementKey('artifact', 'art-canvas'))).toEqual({
      cardId: 'c1',
      surface: 'canvas',
    });
    expect(index.byPrimitiveKey.get(primitivePlacementKey('artifact', 'art-dock'))).toEqual({
      cardId: 's1',
      surface: 'dock',
    });
    expect(index.byCardId.get('c1')).toBe(primitivePlacementKey('artifact', 'art-canvas'));
    expect(index.byCardId.get('s1')).toBe(primitivePlacementKey('artifact', 'art-dock'));
  });

  it('prefers canvas metadata when a primitive is also present in the dock', () => {
    const index = buildPrimitiveSelectionIndex({
      cards: [artifactCard('c1', 'art-both')],
      stagedSyncCards: [artifactCard('s1', 'art-both')],
    });

    expect(index.byPrimitiveKey.get(primitivePlacementKey('artifact', 'art-both'))).toEqual({
      cardId: 'c1',
      surface: 'canvas',
    });
  });

  it('resolves agent chat refs through the thread index', () => {
    const index = buildPrimitiveSelectionIndex({
      cards: [
        {
          id: 'chat-1',
          key: 'notes__agent',
          type: 'agent_chat',
          versions: [],
        },
      ],
      threads: [
        {
          threadId: 't1',
          cardId: 'chat-1',
          artifactRef: { id: 'art-chat', type: 'artifact' },
        },
      ],
      connectorId: 'openai',
    });

    expect(index.byPrimitiveKey.get(primitivePlacementKey('artifact', 'art-chat'))).toEqual({
      cardId: 'chat-1',
      surface: 'canvas',
    });
    expect(index.byCardId.get('chat-1')).toBe(primitivePlacementKey('artifact', 'art-chat'));
  });
});

describe('workspace placement filters', () => {
  it('keeps only canvas and dock primitive rows from a broader project cluster result', () => {
    const index = buildPrimitivePlacementIndex({
      cards: [artifactCard('c1', 'art-canvas')],
      stagedSyncCards: [artifactCard('s1', 'art-dock')],
    });

    const items = filterWorkspaceItemsToPlacementIndex([
      { type: 'artifact', id: 'art-canvas', summary: 'canvas' },
      { type: 'artifact', id: 'art-dock', summary: 'dock' },
      { type: 'artifact', id: 'art-stale', summary: 'stale' },
      { type: 'note', id: 'note-stale', summary: 'stale note' },
    ], index);

    expect(items.map((item) => item.id)).toEqual(['art-canvas', 'art-dock']);
  });

  it('keeps only events targeting active canvas or dock primitive refs', () => {
    const index = buildPrimitivePlacementIndex({
      cards: [artifactCard('c1', 'art-canvas')],
      stagedSyncCards: [artifactCard('s1', 'art-dock')],
    });

    const events = filterWorkspaceEventsToPlacementIndex([
      { id: 'evt-canvas', target_type: 'artifact', target_id: 'art-canvas' },
      { id: 'evt-dock', target_type: 'artifact', target_id: 'art-dock' },
      { id: 'evt-stale', target_type: 'artifact', target_id: 'art-stale' },
      { id: 'evt-cluster', target_type: 'cluster', target_id: 'cluster-1' },
    ], index);

    expect(events.map((event) => event.id)).toEqual(['evt-canvas', 'evt-dock']);
  });
});

describe('decorateWorkspacePlacement', () => {
  it('sets leaf placement and subtype rollup', () => {
    const base = buildWorkspaceTree({
      projectName: 'Test',
      items: [
        {
          type: 'artifact',
          id: 'art-1',
          status: 'doc',
          summary: 'doc: One',
          created_at: '2024-01-02T00:00:00Z',
        },
        {
          type: 'artifact',
          id: 'art-2',
          status: 'doc',
          summary: 'doc: Two',
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      events: [],
      subclusters: [],
    });
    const index = buildPrimitivePlacementIndex({
      cards: [artifactCard('c1', 'art-1')],
      stagedSyncCards: [artifactCard('s1', 'art-2')],
    });
    const tree = decorateWorkspacePlacement(base, index);
    const artifacts = tree.children.find((s) => s.id === 'artifacts');
    const docSubtype = artifacts.children.find((st) => st.label === 'doc');
    expect(docSubtype.placementSummary).toEqual({ canvas: 1, dock: 1 });
    const leaves = docSubtype.children;
    const onCanvas = leaves.find((l) => l.primitiveRef?.id === 'art-1');
    const onDock = leaves.find((l) => l.primitiveRef?.id === 'art-2');
    expect(onCanvas.placement).toBe('canvas');
    expect(onDock.placement).toBe('dock');
  });

  it('inherits placement for event target primitiveRef', () => {
    const base = buildWorkspaceTree({
      projectName: 'Test',
      items: [],
      events: [
        {
          id: 'evt-1',
          action: 'updated',
          target_type: 'artifact',
          target_id: 'art-dock',
          occurred_at: '2024-01-01T00:00:00Z',
        },
      ],
      subclusters: [],
    });
    const index = buildPrimitivePlacementIndex({
      cards: [],
      stagedSyncCards: [artifactCard('s1', 'art-dock')],
    });
    const tree = decorateWorkspacePlacement(base, index);
    const events = tree.children.find((s) => s.id === 'events');
    const updated = events.children.find((st) => st.label === 'updated');
    expect(updated.children[0].placement).toBe('dock');
  });

  it('returns tree unchanged when index is empty', () => {
    const base = buildWorkspaceTree({
      projectName: 'Test',
      items: [{ type: 'artifact', id: 'a1', status: 'doc', summary: 'x', created_at: null }],
      events: [],
      subclusters: [],
    });
    const tree = decorateWorkspacePlacement(base, new Map());
    expect(tree).toBe(base);
    const artifacts = tree.children.find((s) => s.id === 'artifacts');
    const docSubtype = artifacts.children.find((st) => st.label === 'doc');
    expect(docSubtype.children[0].placement).toBeUndefined();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  applyLayoutCommitPayloadToStateRef,
  cleanupProjectArtifactForSyncEntry,
  commitCanvasViewToStateRef,
  updateCardVersionInStateRef,
} from '../useCanvasDocument.js';

describe('useCanvasDocument stateRef commit helpers', () => {
  it('updates canvasView in stateRef before persistence reads it', () => {
    const stateRef = {
      current: {
        projectName: 'Project',
        cards: [],
        canvasView: { x: 0, y: 0, zoom: 1 },
      },
    };
    const nextView = { x: -120, y: 80, zoom: 1.4 };

    const nextState = commitCanvasViewToStateRef(stateRef, nextView);

    expect(stateRef.current).toBe(nextState);
    expect(stateRef.current.canvasView).toEqual(nextView);
  });

  it('updates a card version in stateRef before structural sync commits', () => {
    const stateRef = {
      current: {
        projectName: 'Project',
        canvasView: { x: 0, y: 0, zoom: 1 },
        cards: [
          {
            id: 'card-1',
            key: 'notes__a',
            versions: [
              { version: 1, body: 'old' },
              { version: 2, body: 'current' },
            ],
          },
        ],
      },
    };

    const nextState = updateCardVersionInStateRef(
      stateRef,
      'card-1',
      2,
      { body: 'saved', content_hash: 'hash-1' },
    );

    expect(stateRef.current).toBe(nextState);
    expect(stateRef.current.cards[0].versions[0].body).toBe('old');
    expect(stateRef.current.cards[0].versions[1]).toMatchObject({
      version: 2,
      body: 'saved',
      content_hash: 'hash-1',
    });
  });

  it('applies explicit layout commit payloads before persistence reads stateRef', () => {
    const stateRef = {
      current: {
        projectName: 'Project',
        canvasView: { x: 0, y: 0, zoom: 1 },
        cards: [
          { id: 'card-1', key: 'links__a', x: 10, y: 20, width: 300, height: 180 },
          { id: 'card-2', key: 'links__b', x: 40, y: 50 },
        ],
      },
    };

    const nextState = applyLayoutCommitPayloadToStateRef(stateRef, {
      canvasView: { x: -240, y: 120, zoom: 0.8 },
      cardUpdates: [
        { id: 'card-1', x: 100, y: 200, width: 360, height: 220 },
        { id: 'card-2', x: -30, y: 70 },
      ],
    });

    expect(stateRef.current).toBe(nextState);
    expect(stateRef.current.canvasView).toEqual({ x: -240, y: 120, zoom: 0.8 });
    expect(stateRef.current.cards).toEqual([
      { id: 'card-1', key: 'links__a', x: 100, y: 200, width: 360, height: 220 },
      { id: 'card-2', key: 'links__b', x: -30, y: 70 },
    ]);
  });

  it('cleans project-scoped artifact primitives for deleted artifact cards', async () => {
    const deleteProjectArtifact = vi.fn().mockResolvedValue({ ok: true });
    const refreshGraph = vi.fn();

    const result = await cleanupProjectArtifactForSyncEntry({
      projectId: 'project-1',
      entry: {
        id: 'card-1',
        pinnedVersion: 1,
        versions: [{
          version: 1,
          artifactRef: { id: 'artifact-1', type: 'artifact' },
        }],
      },
      deleteProjectArtifact,
      refreshGraph,
    });

    expect(result.ok).toBe(true);
    expect(deleteProjectArtifact).toHaveBeenCalledWith('project-1', 'artifact-1');
    expect(refreshGraph).toHaveBeenCalledWith({ projectId: 'project-1', force: true });
  });

  it('skips primitive cleanup when a deleted card has no artifact ref', async () => {
    const deleteProjectArtifact = vi.fn();

    const result = await cleanupProjectArtifactForSyncEntry({
      projectId: 'project-1',
      entry: {
        id: 'card-1',
        pinnedVersion: 1,
        versions: [{ version: 1 }],
      },
      deleteProjectArtifact,
    });

    expect(result).toEqual({ attempted: false });
    expect(deleteProjectArtifact).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import { resolveGraphToCards } from '../clusterGraph.js';

describe('resolveGraphToCards', () => {
  const cards = [
    {
      id: 'card-source',
      key: 'src',
      name: 'Source',
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      pinnedVersion: 1,
      versions: [{ version: 1, artifactRef: { id: 'art-source', type: 'artifact' } }],
    },
    {
      id: 'card-target',
      key: 'tgt',
      name: 'Target',
      x: 320,
      y: 40,
      width: 180,
      height: 100,
      pinnedVersion: 1,
      versions: [{ version: 1, artifactRef: { id: 'art-target', type: 'artifact' } }],
    },
  ];

  it('anchors relationship edges to card edge centers', () => {
    const { canvasEdges } = resolveGraphToCards(
      {
        nodes: [],
        edges: [
          {
            id: 'rel-1',
            kind: 'relationship',
            fromId: 'art-source',
            fromType: 'artifact',
            toId: 'art-target',
            toType: 'artifact',
            type: 'references',
          },
        ],
      },
      cards,
    );

    expect(canvasEdges).toHaveLength(1);
    expect(canvasEdges[0]).toMatchObject({
      fromX: 200,
      fromY: 60,
      toX: 320,
      toY: 90,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });
});

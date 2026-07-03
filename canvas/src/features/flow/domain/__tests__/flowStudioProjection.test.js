import { describe, expect, it, vi } from 'vitest';
import {
  buildChildStudioEdge,
  buildChildStudioNode,
  childStudioNodePosition,
  findStudioNodeForCard,
  flowNodeStudioArtifactId,
  studioCardLikeFromOverview,
  studioArtifactIdFromCard,
} from '../flowStudioProjection.js';

const childCard = {
  id: 'card-child',
  name: 'Research Child Studio',
  type: 'studio',
  studioId: 'studio-child',
  parentStudioId: 'studio-parent',
  pinnedVersion: 1,
  versions: [
    {
      version: 1,
      artifactRef: { id: 'studio-child' },
    },
  ],
};

describe('flowStudioProjection', () => {
  it('resolves a child studio artifact id from card metadata', () => {
    expect(studioArtifactIdFromCard(childCard)).toBe('studio-child');
    expect(studioArtifactIdFromCard({
      versions: [{ version: 1, artifactRef: { id: 'artifact-studio' } }],
    })).toBe('artifact-studio');
  });

  it('resolves studio artifact ids from flow nodes', () => {
    expect(flowNodeStudioArtifactId({ artifactId: 'studio-child' })).toBe('studio-child');
    expect(flowNodeStudioArtifactId({ data: { artifactId: 'studio-child' } })).toBe('studio-child');
  });

  it('finds an existing studio node by artifact id', () => {
    const existing = { id: 'node-existing', data: { artifactId: 'studio-child' } };
    expect(findStudioNodeForCard([{ id: 'other', data: { artifactId: 'x' } }, existing], childCard)).toBe(existing);
  });

  it('places child studio nodes outside the source node bounds', () => {
    expect(childStudioNodePosition({
      position: { x: 100, y: 200 },
      measured: { width: 420 },
    })).toEqual({ x: 740, y: 240 });
  });

  it('builds a child studio node with studio-specific display data', () => {
    const node = buildChildStudioNode(childCard, { x: 10, y: 20 });
    expect(node.type).toBe('artifact');
    expect(node.position).toEqual({ x: 10, y: 20 });
    expect(node.data.artifactType).toBe('studio');
    expect(node.data.description).toBe('Child Studio');
    expect(node.data.displayFilename).toBe('Research Child Studio');
  });

  it('builds a card-like projection from a child studio overview', () => {
    const card = studioCardLikeFromOverview({
      studio: {
        id: 'studio-from-overview',
        title: 'Overview Child Studio',
        studioKind: 'domain',
        state: 'seeded',
        parentStudioId: 'parent-studio',
      },
    });
    expect(card.studioId).toBe('studio-from-overview');
    expect(card.parentStudioId).toBe('parent-studio');
    expect(card.versions[0].artifactRef.id).toBe('studio-from-overview');
  });

  it('builds an invocation edge between source and child node', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('edge-id');
    const edge = buildChildStudioEdge('source-node', 'child-node');
    expect(edge).toMatchObject({
      id: 'edge-id',
      source: 'source-node',
      target: 'child-node',
      data: {
        connectionTypeId: 'custom',
        connectionTypeCustom: 'Invokes',
      },
    });
  });
});

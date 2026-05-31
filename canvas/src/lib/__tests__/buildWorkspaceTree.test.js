import { describe, expect, it } from 'vitest';
import { buildWorkspaceTree } from '../buildWorkspaceTree.js';

describe('buildWorkspaceTree', () => {
  it('groups artifacts and relationships by subtype with leaf refs', () => {
    const tree = buildWorkspaceTree({
      projectName: 'Test Project',
      items: [
        {
          type: 'artifact',
          id: 'a1',
          status: 'image',
          summary: 'image: photo.png',
          created_at: '2025-01-02T00:00:00Z',
        },
        {
          type: 'relationship',
          id: 'r1',
          subtype: 'references',
          summary: 'references abc → def',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      events: [],
      subclusters: [],
    });

    expect(tree.label).toBe('Test Project');
    expect(tree.kind).toBe('root');

    const artifacts = tree.children.find((c) => c.id === 'artifacts');
    const imageSubtype = artifacts.children.find((c) => c.label === 'image');
    expect(imageSubtype.children).toHaveLength(1);
    expect(imageSubtype.children[0].primitiveRef).toEqual({ type: 'artifact', id: 'a1' });

    const relationships = tree.children.find((c) => c.id === 'relationships');
    const refSubtype = relationships.children.find((c) => c.label === 'references');
    expect(refSubtype.children[0].primitiveRef).toEqual({ type: 'relationship', id: 'r1' });
  });

  it('keeps empty subtype folders for enum keys', () => {
    const tree = buildWorkspaceTree({
      projectName: 'Empty',
      items: [],
      events: [],
      subclusters: [],
    });

    const artifacts = tree.children.find((c) => c.id === 'artifacts');
    expect(artifacts.children.length).toBeGreaterThan(0);
    expect(artifacts.children.every((c) => c.kind === 'subtype')).toBe(true);
    expect(artifacts.count).toBe(0);
  });

  it('lists clusters before artifacts', () => {
    const tree = buildWorkspaceTree({
      projectName: 'Order',
      items: [{ type: 'artifact', id: 'a1', status: 'doc', summary: 'x', created_at: null }],
      events: [],
      subclusters: [{ id: 'c1', name: 'Group A', created_at: null }],
    });
    expect(tree.children[0].id).toBe('clusters');
    expect(tree.children[1].id).toBe('artifacts');
  });

  it('groups audio artifacts by subtype', () => {
    const tree = buildWorkspaceTree({
      projectName: 'Media',
      items: [
        {
          type: 'artifact',
          id: 'a1',
          status: 'audio',
          summary: 'audio: song.mp3',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      events: [],
      subclusters: [],
    });
    const audio = tree.children
      .find((c) => c.id === 'artifacts')
      .children.find((c) => c.label === 'audio');
    expect(audio.children).toHaveLength(1);
  });

  it('groups events by action and links to target primitive', () => {
    const tree = buildWorkspaceTree({
      projectName: 'Events',
      items: [],
      events: [
        {
          id: 'e1',
          action: 'created',
          target_id: 'art-1',
          target_type: 'artifact',
          occurred_at: '2025-01-03T00:00:00Z',
        },
      ],
      subclusters: [],
    });

    const eventsSection = tree.children.find((c) => c.id === 'events');
    const created = eventsSection.children.find((c) => c.label === 'created');
    expect(created.children[0].primitiveRef).toEqual({ type: 'artifact', id: 'art-1' });
  });
});

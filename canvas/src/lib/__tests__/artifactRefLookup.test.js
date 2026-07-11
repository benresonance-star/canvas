import { describe, expect, it } from 'vitest';
import { matchArtifactRowToCard } from '../artifactRefLookup.js';

describe('artifactRefLookup', () => {
  it('matches by cardKey metadata', () => {
    const artifact = {
      id: 'art-1',
      title: 'Resort Villa',
      content_hash: 'hash-1',
      metadata: {
        cardKey: 'IFC/Resort Villa',
        filename: 'Resort Villa.ifc',
        relativePath: 'IFC/Resort Villa.ifc',
        canvas_kind: 'bim-model',
      },
    };
    const card = { key: 'IFC/Resort Villa', name: 'Resort Villa', type: 'bim-model' };
    const pinned = {
      filename: 'Resort Villa.ifc',
      relativePath: 'IFC/Resort Villa.ifc',
      content_hash: 'hash-1',
    };
    expect(matchArtifactRowToCard(artifact, card, pinned)).toBe(true);
  });

  it('matches user_task by name and kind', () => {
    const artifact = {
      id: 'art-2',
      title: 'IFC Viewer TO DO',
      metadata: {
        cardKey: 'tasks__IFC Viewer TO DO',
        filename: 'tasks__IFC Viewer TO DO-v1.md',
        canvas_kind: 'user_task',
        name: 'IFC Viewer TO DO',
      },
    };
    const card = {
      key: 'tasks__IFC Viewer TO DO',
      name: 'IFC Viewer TO DO',
      type: 'user_task',
    };
    const pinned = { filename: 'tasks__IFC Viewer TO DO-v1.md', version: 1 };
    expect(matchArtifactRowToCard(artifact, card, pinned)).toBe(true);
  });
});

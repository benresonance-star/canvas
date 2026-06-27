import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateRelationship = vi.fn();

vi.mock('../../primitivesApi.js', () => ({
  createRelationship: (...args) => mockCreateRelationship(...args),
}));

import {
  extractLinkTargetsFromMarkdown,
  ingestLinksFromVersions,
  isLinkSourceCardType,
  isLinkableArtifactType,
} from '../linkIngest.js';

describe('linkIngest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRelationship.mockResolvedValue({ created: true });
  });

  it('extracts wikilinks and frontmatter links from markdown', () => {
    const content = `---
links:
  - notes__target-a
---
Body with [[notes__target-b]]`;
    expect(extractLinkTargetsFromMarkdown(content)).toEqual([
      'notes__target-a',
      'notes__target-b',
    ]);
  });

  it('recognizes link source card and artifact types', () => {
    expect(isLinkSourceCardType('code')).toBe(true);
    expect(isLinkSourceCardType('user_note')).toBe(true);
    expect(isLinkSourceCardType('bookmark')).toBe(false);

    expect(isLinkableArtifactType('doc', { canvas_kind: 'code' })).toBe(true);
    expect(isLinkableArtifactType('doc', { file_kind: 'spreadsheet' })).toBe(false);
    expect(isLinkableArtifactType('user_task')).toBe(true);
  });

  it('ingests wikilinks from user_task versions', async () => {
    const sourceRef = { id: 'task-artifact', type: 'artifact' };
    const targetRef = { id: 'note-artifact', type: 'artifact' };
    const cardKeyToRef = new Map([
      ['tasks__my-task', sourceRef],
      ['notes__related', targetRef],
    ]);

    const result = await ingestLinksFromVersions({
      clusterId: 'cluster-1',
      flatVersions: [{
        cardKey: 'tasks__my-task',
        cardType: 'user_task',
        artifactRef: sourceRef,
        content: '---\ntaskStatus: general\n---\n\nSee [[notes__related]]',
      }],
      cardKeyToRef,
    });

    expect(result.created).toBe(1);
    expect(mockCreateRelationship).toHaveBeenCalledWith(
      'cluster-1',
      expect.objectContaining({
        from_ref: sourceRef,
        to_ref: targetRef,
        type: 'references',
      }),
      { idempotent: true },
    );
  });

  it('ingests wikilinks from code file versions', async () => {
    const sourceRef = { id: 'code-artifact', type: 'artifact' };
    const targetRef = { id: 'note-artifact', type: 'artifact' };
    const cardKeyToRef = new Map([
      ['src__utils', sourceRef],
      ['notes__related', targetRef],
    ]);

    const result = await ingestLinksFromVersions({
      clusterId: 'cluster-1',
      flatVersions: [{
        cardKey: 'src__utils',
        cardType: 'code',
        artifactRef: sourceRef,
        content: '// See [[notes__related]]\nexport const x = 1;\n',
      }],
      cardKeyToRef,
    });

    expect(result.created).toBe(1);
    expect(mockCreateRelationship).toHaveBeenCalledWith(
      'cluster-1',
      expect.objectContaining({
        from_ref: sourceRef,
        to_ref: targetRef,
        type: 'references',
      }),
      { idempotent: true },
    );
  });

  it('skips card types that are not link sources', async () => {
    await ingestLinksFromVersions({
      clusterId: 'cluster-1',
      flatVersions: [{
        cardKey: 'links__bookmark',
        cardType: 'bookmark',
        artifactRef: { id: 'bookmark-artifact', type: 'artifact' },
        content: '[[notes__target]]',
      }],
      cardKeyToRef: new Map([
        ['links__bookmark', { id: 'bookmark-artifact', type: 'artifact' }],
        ['notes__target', { id: 'note-artifact', type: 'artifact' }],
      ]),
    });

    expect(mockCreateRelationship).not.toHaveBeenCalled();
  });
});

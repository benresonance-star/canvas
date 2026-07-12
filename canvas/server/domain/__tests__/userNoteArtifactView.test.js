import { describe, expect, it } from 'vitest';
import {
  auditProjectUserNoteViews,
  applyArtifactViewToLegacyCard,
  compareUserNoteView,
  legacyUserNoteToArtifactView,
  projectUserNoteViews,
} from '../userNoteArtifactView.js';

const note = {
  id: 'card-1', type: 'user_note', x: 12, y: 34, width: 280, height: 190, zIndex: 3,
  selected: true, hover: true,
  versions: [{ version: 1, artifactRef: { id: 'artifact-1' }, relativePath: 'nested/note.md' }],
  pinnedVersion: 1,
};

describe('userNoteArtifactView', () => {
  it('projects exact stable geometry and excludes transient state', () => {
    const view = legacyUserNoteToArtifactView('project-1', note, 'canvas');
    expect(view).toMatchObject({
      projectId: 'project-1', artifactId: 'artifact-1', surface: 'canvas',
      x: 12, y: 34, width: 280, height: 190, zIndex: 3,
    });
    expect(view).not.toHaveProperty('selected');
    expect(view).not.toHaveProperty('hover');
  });

  it('round trips geometry without replacing artifact content', () => {
    const view = legacyUserNoteToArtifactView('project-1', note, 'canvas');
    const restored = applyArtifactViewToLegacyCard({ ...note, x: 0 }, view);
    expect(restored.x).toBe(12);
    expect(restored.versions).toEqual(note.versions);
    expect(compareUserNoteView(restored, view)).toBeNull();
  });

  it('preserves canvas and dock surfaces and skips unresolved identity', () => {
    const views = projectUserNoteViews('project-1', {
      cards: [note, { ...note, id: 'pending', versions: [] }],
      stagedSyncCards: [{ ...note, stagingId: 'dock-1' }],
    });
    expect(views.map((view) => view.surface)).toEqual(['canvas', 'dock']);
  });

  it('categorizes drift', () => {
    const view = legacyUserNoteToArtifactView('project-1', note, 'canvas');
    expect(compareUserNoteView(note, { ...view, x: 99 })).toBe('geometry_mismatch');
    expect(compareUserNoteView(note, null)).toBe('missing_view');
  });

  it('treats fully contracted geometry as canonical while rejecting partial geometry', () => {
    const view = legacyUserNoteToArtifactView('project-1', note, 'canvas');
    const { x: _x, y: _y, width: _width, height: _height, zIndex: _zIndex, ...contracted } = note;
    expect(legacyUserNoteToArtifactView('project-1', contracted, 'canvas'))
      .toMatchObject({ geometryContracted: true });
    expect(compareUserNoteView(contracted, view)).toBeNull();
    expect(compareUserNoteView({ ...contracted, x: 1 }, view)).toBe('geometry_mismatch');
  });

  it('audits stored views against the authoritative server document', () => {
    const view = legacyUserNoteToArtifactView('project-1', note, 'canvas');
    expect(auditProjectUserNoteViews('project-1', { cards: [note] }, [{
      ...view,
      id: 'preserved-legacy-row-id',
    }])).toEqual({
      loads: 1,
      eligible_cards: 1,
      matched_cards: 1,
    });
    expect(auditProjectUserNoteViews('project-1', { cards: [note] }, [
      { ...view, width: 999 },
    ])).toMatchObject({ geometry_mismatch: 1, matched_cards: 0 });
  });
});

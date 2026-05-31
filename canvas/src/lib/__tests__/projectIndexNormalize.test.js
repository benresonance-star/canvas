import { describe, it, expect } from 'vitest';
import {
  dedupeProjectsById,
  collapseDuplicateProjectNames,
  findDuplicateDisplayNameGroups,
  normalizeWorkspaceIndex,
  pickPreferredProjectRow,
} from '../projectIndexNormalize.js';

describe('dedupeProjectsById', () => {
  it('keeps one row per id with greatest updatedAt', () => {
    const out = dedupeProjectsById([
      { id: 'a', name: 'A', updatedAt: 10 },
      { id: 'a', name: 'A newer', updatedAt: 50 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('A newer');
  });
});

describe('collapseDuplicateProjectNames', () => {
  it('keeps active project among same-name duplicates', () => {
    const { projects, removedIds } = collapseDuplicateProjectNames(
      [
        { id: '1', name: 'Earth Rise', updatedAt: 10 },
        { id: '2', name: 'Earth Rise', updatedAt: 100 },
        { id: '3', name: 'Earth Rise', updatedAt: 50 },
      ],
      { activeProjectId: '3' },
    );
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe('3');
    expect(removedIds.sort()).toEqual(['1', '2']);
  });

  it('keeps newest updatedAt when active is not among duplicates', () => {
    const { projects, removedIds } = collapseDuplicateProjectNames(
      [
        { id: '1', name: 'Earth Rise', updatedAt: 10 },
        { id: '2', name: 'Earth Rise', updatedAt: 100 },
      ],
      { activeProjectId: 'other' },
    );
    expect(projects[0].id).toBe('2');
    expect(removedIds).toEqual(['1']);
  });

  it('leaves distinct names unchanged', () => {
    const { projects, removedIds } = collapseDuplicateProjectNames(
      [
        { id: '1', name: 'Home Base', updatedAt: 10 },
        { id: '2', name: 'Earth Rise', updatedAt: 20 },
      ],
      { activeProjectId: '1' },
    );
    expect(projects).toHaveLength(2);
    expect(removedIds).toEqual([]);
  });
});

describe('findDuplicateDisplayNameGroups', () => {
  it('reports non-archived rows with the same normalized name', () => {
    const groups = findDuplicateDisplayNameGroups([
      { id: 'a', name: 'Untitled Project', archived: false },
      { id: 'b', name: 'Untitled Project', archived: false },
      { id: 'c', name: 'Other', archived: false },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].ids.sort()).toEqual(['a', 'b']);
  });
});

describe('pickPreferredProjectRow', () => {
  it('prefers activeProjectId', () => {
    const a = { id: 'a', updatedAt: 100 };
    const b = { id: 'b', updatedAt: 1 };
    expect(pickPreferredProjectRow(a, b, 'b')).toBe(b);
  });
});

describe('normalizeWorkspaceIndex', () => {
  it('keeps all same-name projects (no name collapse)', () => {
    const { index, removedIds } = normalizeWorkspaceIndex({
      version: 1,
      activeProjectId: 'b',
      projects: [
        { id: 'a', name: 'Untitled Project', updatedAt: 50, archived: false },
        { id: 'b', name: 'Untitled Project', updatedAt: 10, archived: false },
      ],
    });
    expect(removedIds).toEqual([]);
    expect(index.projects).toHaveLength(2);
    expect(index.activeProjectId).toBe('b');
  });

  it('dedupes duplicate ids only', () => {
    const { index, removedIds } = normalizeWorkspaceIndex({
      version: 1,
      activeProjectId: 'a',
      projects: [
        { id: 'a', name: 'A', updatedAt: 10 },
        { id: 'a', name: 'A newer', updatedAt: 50 },
      ],
    });
    expect(removedIds).toEqual([]);
    expect(index.projects).toHaveLength(1);
    expect(index.projects[0].name).toBe('A newer');
  });
});

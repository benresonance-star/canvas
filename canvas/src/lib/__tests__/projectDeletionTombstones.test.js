import { describe, it, expect, beforeEach, vi } from 'vitest';

const storage = new Map();

function installStorage() {
  vi.stubGlobal('localStorage', {
    removeItem: (key) => storage.delete(key),
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  });
}
import {
  recordDeletedProjectId,
  isDeletedProjectId,
  clearDeletedProjectTombstonesForTests,
} from '../projectDeletionTombstones.js';
import { mergeProjectIndices } from '../sync/projectSyncMerge.js';

describe('projectDeletionTombstones', () => {
  beforeEach(() => {
    storage.clear();
    installStorage();
    clearDeletedProjectTombstonesForTests();
  });

  it('records deleted id and merge omits it from server index', () => {
    recordDeletedProjectId('gone-1');
    const local = {
      version: 1,
      activeProjectId: 'keep-1',
      projects: [{ id: 'keep-1', name: 'Keep', updatedAt: 1, archived: false }],
    };
    const server = {
      version: 1,
      activeProjectId: 'gone-1',
      projects: [
        { id: 'keep-1', name: 'Keep', updatedAt: 1, archived: false },
        { id: 'gone-1', name: 'Gone', updatedAt: 2, archived: false },
      ],
    };
    const { index } = mergeProjectIndices(local, server);
    expect(index.projects.map((p) => p.id)).toEqual(['keep-1']);
    expect(isDeletedProjectId('gone-1')).toBe(true);
  });
});

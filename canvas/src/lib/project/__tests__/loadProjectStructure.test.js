import { describe, it, expect } from 'vitest';
import { loadProjectStructure, applyProjectLoadFence } from '../loadProjectStructure.js';

describe('loadProjectStructure', () => {
  it('exports unified load API', () => {
    expect(typeof loadProjectStructure).toBe('function');
    expect(typeof applyProjectLoadFence).toBe('function');
  });

  it('applyProjectLoadFence returns payload when project id missing', async () => {
    const payload = { cards: [] };
    expect(await applyProjectLoadFence(null, payload)).toBe(payload);
    expect(await applyProjectLoadFence('p1', null)).toBeNull();
  });

  it('returns null for empty project id', async () => {
    expect(await loadProjectStructure(null)).toBeNull();
    expect(await loadProjectStructure('')).toBeNull();
  });
});

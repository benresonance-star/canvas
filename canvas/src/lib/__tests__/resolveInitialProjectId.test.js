import { describe, it, expect } from 'vitest';
import {
  resolveInitialProjectMode,
  resolveInitialProjectId,
  resolveRecoverLocalBodyId,
} from '../resolveInitialProjectId.js';

describe('resolveInitialProjectId', () => {
  it('returns none when index empty', () => {
    expect(resolveInitialProjectMode({ projects: [] })).toBe('none');
    expect(resolveInitialProjectId({ projects: [] })).toBeNull();
  });

  it('honors index active id', () => {
    const index = {
      activeProjectId: 'a',
      projects: [{ id: 'a', name: 'A', updatedAt: 1, archived: false }],
    };
    expect(resolveInitialProjectMode(index)).toBe('honorIndex');
    expect(resolveInitialProjectId(index)).toBe('a');
  });

  it('recoverLocalBody only when committed was null', () => {
    expect(resolveRecoverLocalBodyId('a', 'b', true)).toBe('b');
    expect(resolveRecoverLocalBodyId('a', 'b', false)).toBe('a');
    expect(resolveRecoverLocalBodyId(null, 'b', true)).toBe('b');
  });
});

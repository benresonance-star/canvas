import { describe, it, expect } from 'vitest';
import {
  resolveProjectDisplayName,
  canonicalProjectNameFromIndex,
} from '../projectReconcile.js';

describe('resolveProjectDisplayName', () => {
  const index = {
    projects: [
      { id: 'earth', name: 'EARTHRISE' },
      { id: 'other', name: 'HOME' },
    ],
  };

  it('reads the workspace index row only', () => {
    expect(resolveProjectDisplayName(index, 'earth')).toBe('EARTHRISE');
  });

  it('returns default when the row is missing', () => {
    expect(resolveProjectDisplayName(index, 'missing', 'Untitled Project')).toBe(
      'Untitled Project',
    );
  });

  it('ignores stale document titles (canonical alias)', () => {
    expect(
      canonicalProjectNameFromIndex(index, 'earth', 'Untitled Project'),
    ).toBe('EARTHRISE');
  });

  it('uses index default name when row still says Untitled Project', () => {
    const staleIndex = {
      projects: [{ id: 'eagle', name: 'Untitled Project' }],
    };
    expect(resolveProjectDisplayName(staleIndex, 'eagle', 'Untitled Project')).toBe(
      'Untitled Project',
    );
    expect(
      canonicalProjectNameFromIndex(staleIndex, 'eagle', 'Eagle'),
    ).toBe('Untitled Project');
  });
});

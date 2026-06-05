import { describe, it, expect } from 'vitest';
import {
  resolveProjectDisplayName,
  canonicalProjectNameFromIndex,
} from '../projectReconcile.js';
import {
  pickAuthoritativeProjectDisplayName,
  shouldSyncIndexNameToState,
} from '../projectDisplayName.js';

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

describe('pickAuthoritativeProjectDisplayName', () => {
  it('prefers custom state over stale index default', () => {
    expect(
      pickAuthoritativeProjectDisplayName('Untitled Project', 'FROG'),
    ).toBe('FROG');
  });

  it('prefers non-default index over empty state', () => {
    expect(pickAuthoritativeProjectDisplayName('TREE STORM', '')).toBe(
      'TREE STORM',
    );
  });
});

describe('shouldSyncIndexNameToState', () => {
  it('allows sync when both index and state are default', () => {
    expect(
      shouldSyncIndexNameToState('Untitled Project', 'Untitled Project'),
    ).toBe(true);
  });

  it('blocks default index from clobbering custom state title', () => {
    expect(shouldSyncIndexNameToState('Untitled Project', 'FROG')).toBe(false);
  });

  it('allows non-default index to update state', () => {
    expect(shouldSyncIndexNameToState('FROG', 'Untitled Project')).toBe(true);
  });
});

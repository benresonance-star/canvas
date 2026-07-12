import { describe, expect, it } from 'vitest';
import {
  defaultCapabilitiesForArtifactType,
  getArtifactTypeRegistration,
} from '../artifactTypeRegistry.js';

describe('artifactTypeRegistry', () => {
  it('preserves existing type capability defaults', () => {
    expect(defaultCapabilitiesForArtifactType('user_note')).toEqual([
      'canEdit', 'canReview', 'canReference',
    ]);
    expect(defaultCapabilitiesForArtifactType('studio')).toContain('canRun');
    expect(defaultCapabilitiesForArtifactType('unknown')).toEqual(['canReference']);
  });

  it('returns copies rather than mutable registry state', () => {
    const first = getArtifactTypeRegistration('user_note');
    first.defaultCapabilities.push('mutated');
    expect(getArtifactTypeRegistration('user_note').defaultCapabilities).not.toContain('mutated');
  });
});

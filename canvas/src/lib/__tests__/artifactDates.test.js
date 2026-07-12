import { describe, it, expect } from 'vitest';
import {
  initialArtifactDates,
  mergeArtifactDates,
  mergeArtifactMetadataDates,
  artifactMetadataDatesChanged,
  resolveArtifactFileDates,
  formatArtifactDateTime,
} from '../artifactDates.js';

describe('artifactDates', () => {
  it('formatArtifactDateTime uses day/month/year - time', () => {
    const formatted = formatArtifactDateTime('2024-06-15T10:30:00.000Z');
    expect(formatted).toMatch(/^\d{2}\/06\/2024 - \d{1,2}:\d{2} (AM|PM)$/);
    expect(formatted).toContain('/06/2024');
  });

  it('initialArtifactDates sets dateCreated from file mtime', () => {
    expect(initialArtifactDates(1_700_000_000_000)).toEqual({
      dateCreated: '2023-11-14T22:13:20.000Z',
    });
  });

  it('mergeArtifactDates keeps dateCreated on unchanged refresh', () => {
    const existing = { dateCreated: '2024-01-01T00:00:00.000Z' };
    expect(
      mergeArtifactDates(existing, {
        lastModified: Date.parse('2024-01-01T00:00:00.000Z'),
      }),
    ).toEqual({ dateCreated: '2024-01-01T00:00:00.000Z' });
  });

  it('mergeArtifactDates adds dateModified when file mtime is newer', () => {
    const existing = { dateCreated: '2024-01-01T00:00:00.000Z' };
    expect(
      mergeArtifactDates(existing, {
        lastModified: Date.parse('2024-06-01T00:00:00.000Z'),
      }),
    ).toEqual({
      dateCreated: '2024-01-01T00:00:00.000Z',
      dateModified: '2024-06-01T00:00:00.000Z',
    });
  });

  it('mergeArtifactDates adds dateModified when content changed', () => {
    const existing = { dateCreated: '2024-01-01T00:00:00.000Z' };
    expect(
      mergeArtifactDates(existing, {
        lastModified: Date.parse('2024-01-01T00:00:00.000Z'),
        contentChanged: true,
      }),
    ).toEqual({
      dateCreated: '2024-01-01T00:00:00.000Z',
      dateModified: '2024-01-01T00:00:00.000Z',
    });
  });

  it('mergeArtifactMetadataDates preserves created and merges modified', () => {
    const merged = mergeArtifactMetadataDates(
      { dateCreated: '2024-01-01T00:00:00.000Z' },
      { dateCreated: '2024-01-13T00:00:00.000Z', dateModified: '2024-01-13T00:00:00.000Z' },
    );
    expect(merged).toEqual({
      dateCreated: '2024-01-01T00:00:00.000Z',
      dateModified: '2024-01-13T00:00:00.000Z',
    });
    expect(
      artifactMetadataDatesChanged(
        { dateCreated: '2024-01-01T00:00:00.000Z' },
        merged,
      ),
    ).toBe(true);
  });

  it('resolveArtifactFileDates prefers linked canvas version dates', () => {
    const dates = resolveArtifactFileDates('art-1', {
      cards: [{
        key: 'html__page',
        dateCreated: '2024-02-01T00:00:00.000Z',
        versions: [{
          version: 1,
          artifactRef: { id: 'art-1', type: 'artifact' },
          dateCreated: '2024-01-15T00:00:00.000Z',
          dateModified: '2024-03-01T00:00:00.000Z',
        }],
        pinnedVersion: 1,
      }],
      meta: { dateCreated: '2024-01-01T00:00:00.000Z' },
    });
    expect(dates).toEqual({
      dateCreated: '2024-01-15T00:00:00.000Z',
      dateModified: '2024-03-01T00:00:00.000Z',
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  getArtifactTypeColor,
  getRelationTypeColor,
  getPrimitiveKindColor,
  getLegendEntries,
} from '../primitiveTreeColors.js';

describe('primitiveTreeColors', () => {
  it('returns stable colors for known artifact and relation types', () => {
    expect(getArtifactTypeColor('image')).toBe('#3b82f6');
    expect(getArtifactTypeColor('doc')).toBe('#ef4444');
    expect(getArtifactTypeColor('audio')).toBe('#22c55e');
    expect(getArtifactTypeColor('video')).toBe('#f97316');
    expect(getArtifactTypeColor('ncc_clause')).toBe('#64748b');
    expect(getRelationTypeColor('references')).toBe('#f59e0b');
    expect(getPrimitiveKindColor('note')).toBe('#8b5cf6');
  });

  it('lists clusters before artifacts in legend', () => {
    const entries = getLegendEntries();
    const clusterIdx = entries.findIndex((e) => e.sectionId === 'clusters');
    const artifactIdx = entries.findIndex((e) => e.sectionId === 'artifacts');
    expect(clusterIdx).toBeGreaterThanOrEqual(0);
    expect(artifactIdx).toBeGreaterThan(clusterIdx);
  });

  it('includes audio and video in artifact legend', () => {
    const artifacts = getLegendEntries().find((e) => e.sectionId === 'artifacts');
    const ids = artifacts.subtypes.map((s) => s.id);
    expect(ids).toContain('audio');
    expect(ids).toContain('video');
    expect(ids).not.toContain('ncc_clause');
  });
});

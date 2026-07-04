import { describe, it, expect } from 'vitest';
import { slimProjectPayloadForCache, stripCardForPersist } from '../projectSlim.js';
import { buildPlacementsFromArrays } from '../artifactPlacementsMap.js';

describe('slimProjectPayloadForCache', () => {
  it('preserves minimalPreview on slim media cards', () => {
    const card = {
      id: 'img1',
      key: 'images__photo',
      type: 'image',
      x: 0,
      y: 0,
      pinnedVersion: 1,
      minimalPreview: true,
      versions: [{ version: 1, filename: 'photo.png' }],
    };
    const slim = stripCardForPersist(card, { slimCard: true });
    expect(slim.minimalPreview).toBe(true);
  });

  it('preserves threeDViewerState on slim 3D model cards', () => {
    const viewerState = { showGrid: false, showAxes: false, displayMode: 'material' };
    const card = {
      id: 'model1',
      key: 'models__chair',
      type: '3d-model',
      x: 0,
      y: 0,
      pinnedVersion: 1,
      threeDViewerState: viewerState,
      versions: [{ version: 1, filename: 'chair.glb' }],
    };
    const slim = stripCardForPersist(card, { slimCard: true });
    expect(slim.threeDViewerState).toEqual(viewerState);
  });

  it('preserves sonic studio card state on slim cards', () => {
    const card = {
      id: 'sonic-card-1',
      key: 'music__sonic-1',
      prefix: 'music',
      name: 'Sonic Studio 1',
      type: 'sonic_studio',
      x: 10,
      y: 20,
      pinnedVersion: 1,
      sonicStudioId: 'sonic-1',
      sonicStudioState: {
        voices: [{ id: 'kick-voice', archetype: 'kick', name: 'Kick' }],
      },
      sonicSourceStateHash: 'sonic-abc',
      versions: [{
        version: 1,
        filename: 'Sonic Studio 1.sonicstudio',
        ext: 'sonicstudio',
        inline: true,
        artifactRef: { id: 'sonic-1', type: 'artifact' },
      }],
    };

    const slim = stripCardForPersist(card, { slimCard: true });

    expect(slim.sonicStudioId).toBe('sonic-1');
    expect(slim.sonicStudioState.voices).toHaveLength(1);
    expect(slim.sonicSourceStateHash).toBe('sonic-abc');
  });

  it('preserves music-agent card references on slim cards', () => {
    const card = {
      id: 'beat-card-1',
      key: 'music__beat-1',
      prefix: 'music',
      name: 'Beat Agent 1',
      type: 'music-agent',
      x: 10,
      y: 20,
      pinnedVersion: 1,
      musicAgentId: 'agent-1',
      musicAgentType: 'beat',
      versions: [{
        version: 1,
        filename: 'Beat Agent 1.musicartifact',
        ext: 'musicartifact',
        inline: true,
        artifactRef: { id: 'agent-1', type: 'artifact' },
        musicAgentId: 'agent-1',
        musicAgentType: 'beat',
      }],
    };

    const slim = stripCardForPersist(card, { slimCard: true });

    expect(slim.musicAgentId).toBe('agent-1');
    expect(slim.musicAgentType).toBe('beat');
    expect(slim.versions[0].artifactRef.id).toBe('agent-1');
  });

  it('preserves studio card references on slim cards', () => {
    const card = {
      id: 'studio-card-1',
      key: 'studios__studio-1',
      prefix: 'studios',
      name: 'Cell Mitosis Studio',
      type: 'studio',
      x: 10,
      y: 20,
      pinnedVersion: 1,
      studioId: 'studio-1',
      studioKind: 'domain',
      studioState: 'seeded',
      studioSummary: 'Study mitosis.',
      parentStudioId: 'parent-1',
      parentStudioTitle: 'Cell Studio',
      studioSurfaces: [{ id: 'surface-1', artifactId: 'flow-1', isPrimary: true }],
      studioCounts: { runs: 0, promotions: 0 },
      primaryFlowId: 'flow-1',
      versions: [{
        version: 1,
        studioId: 'studio-1',
        artifactRef: { id: 'studio-1', type: 'artifact' },
      }],
    };

    const slim = stripCardForPersist(card, { slimCard: true });

    expect(slim.studioId).toBe('studio-1');
    expect(slim.parentStudioId).toBe('parent-1');
    expect(slim.parentStudioTitle).toBe('Cell Studio');
    expect(slim.studioSurfaces).toHaveLength(1);
    expect(slim.primaryFlowId).toBe('flow-1');
    expect(slim.versions[0].artifactRef.id).toBe('studio-1');
  });

  it('produces smaller serialised payload with v2 placements than duplicated records', () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      key: `notes__note-${i}`,
      type: 'markdown',
      x: i * 10,
      y: i * 5,
      pinnedVersion: 1,
      versions: [
        {
          version: 1,
          content: 'x'.repeat(5000),
          cardType: 'markdown',
        },
      ],
    }));
    const v1Map = {};
    for (const c of cards) {
      v1Map[c.key] = { surface: 'canvas', record: c };
    }
    const fat = JSON.stringify({
      cards,
      stagedSyncCards: [],
      artifactPlacements: v1Map,
    });
    const slimPayload = {
      cards,
      stagedSyncCards: [],
      artifactPlacements: buildPlacementsFromArrays(cards, []),
    };
    const { serialised } = slimProjectPayloadForCache(slimPayload);
    expect(serialised.length).toBeLessThan(fat.length);
  });

  it('strips placement records and staged dataUrls from persisted payloads', () => {
    const largeDataUrl = `data:application/pdf;base64,${'A'.repeat(1000)}`;
    const staged = {
      stagingId: 's1',
      key: 'pdf__large',
      type: 'pdf',
      versions: [{
        version: 1,
        dataUrl: largeDataUrl,
        previewCacheKey: 'p:pdf__large:v1',
      }],
    };
    const { payload, serialised } = slimProjectPayloadForCache({
      cards: [],
      stagedSyncCards: [staged],
      artifactPlacements: {
        pdf__large: {
          surface: 'dock',
          placement: { key: 'pdf__large', stagingId: 's1' },
          record: staged,
        },
      },
    });

    expect(payload.stagedSyncCards[0].versions[0].dataUrl).toBeNull();
    expect(payload.stagedSyncCards[0].versions[0].previewCacheKey).toBe('p:pdf__large:v1');
    expect(payload.artifactPlacements.pdf__large.record).toBeUndefined();
    expect(serialised).not.toContain(largeDataUrl);
  });

  it('strips 3D object URLs while preserving preview cache keys', () => {
    const slim = stripCardForPersist({
      id: 'model-1',
      key: 'models__chair',
      type: '3d-model',
      pinnedVersion: 1,
      versions: [{
        version: 1,
        ext: 'glb',
        objectUrl: 'blob:model-1',
        previewCacheKey: 'p:models__chair:v1',
        inline: true,
      }],
    }, { slimCard: true });

    expect(slim.versions[0].objectUrl).toBeUndefined();
    expect(slim.versions[0].previewCacheKey).toBe('p:models__chair:v1');
    expect(slim.versions[0].dataUrl).toBeNull();
  });

  it('triggers trim when over trim target', () => {
    const cards = [
      {
        id: 'big',
        key: 'img__big',
        type: 'image',
        versions: [{ version: 1, dataUrl: 'data:image/png;base64,' + 'A'.repeat(4_000_000) }],
      },
    ];
    const { trimmed, serialised } = slimProjectPayloadForCache({
      cards,
      stagedSyncCards: [],
    });
    expect(trimmed).toBe(true);
    expect(serialised.length).toBeLessThan(4 * 1024 * 1024);
  });
});

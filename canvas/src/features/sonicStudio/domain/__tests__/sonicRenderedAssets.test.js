import { describe, expect, it } from 'vitest';
import { createDefaultPercussionKit } from '../../../../../packages/sonic-core/src/index.js';
import {
  bakeSonicRenderedAssets,
  findSonicRenderedAsset,
  renderedAssetToChannelBuffers,
  voiceSourceStateHash,
} from '../sonicRenderedAssets.js';

describe('sonicRenderedAssets', () => {
  it('bakes one rendered asset per voice', () => {
    const kit = createDefaultPercussionKit();
    const assets = bakeSonicRenderedAssets({
      voices: [kit.kick, kit.snare],
      tempoBpm: 120,
    });
    expect(assets).toHaveLength(2);
    expect(assets[0].channels.left.length).toBeGreaterThan(1000);
    expect(assets[0].sourceStateHash).toBe(voiceSourceStateHash(kit.kick));
  });

  it('reuses previous assets when voice hash is unchanged', () => {
    const kit = createDefaultPercussionKit();
    const previous = [{
      id: 'asset-kick',
      voiceId: kit.kick.id,
      sourceStateHash: voiceSourceStateHash(kit.kick),
      channels: { left: [0.1, 0.2], right: [0.1, 0.2] },
    }];
    const assets = bakeSonicRenderedAssets({ voices: [kit.kick] }, { previousAssets: previous });
    expect(assets[0]).toBe(previous[0]);
  });

  it('finds rendered assets by voice and hash', () => {
    const asset = {
      id: 'asset-1',
      voiceId: 'kick-voice',
      sourceStateHash: 'hash-1',
      channels: { left: [0.5], right: [0.5] },
    };
    expect(findSonicRenderedAsset([asset], { voiceId: 'kick-voice', sourceStateHash: 'hash-1' })).toBe(asset);
    const buffers = renderedAssetToChannelBuffers(asset);
    expect(buffers.left[0]).toBeCloseTo(0.5);
  });
});

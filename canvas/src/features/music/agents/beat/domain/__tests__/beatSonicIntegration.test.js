import { describe, expect, it } from 'vitest';
import {
  createDefaultBeatSonicTemporalState,
  createDefaultSpaceState,
  deriveSonicTemporalFromDescriptors,
  mapSpaceStateToFdnParams,
} from '../../../../../../../packages/music-core/src/index.js';
import { resolveBeatAudioRouting, resolveBeatSpaceRouting } from '../resolveBeatAudioRouting.js';
import { mapSonicTemporalToWorkletState } from '../mapSonicTemporalToWorkletParams.js';
import {
  assignSonicVoiceToTrack,
  assignEmbeddedSonicToTrack,
  clearTrackSonicVoice,
  getSonicStudioCardVoices,
  updateTrackSonicVoice,
} from '../beatTrackSoundSource.js';
import { beatTrackSampleSignature, resolveBeatTrackSample } from '../beatSampleResolver.js';

describe('resolveBeatAudioRouting', () => {
  it('bypasses temporal FX when sonicTemporalBypass is true', () => {
    const result = resolveBeatAudioRouting({
      sonicTemporal: createDefaultBeatSonicTemporalState(),
      audioRouting: { sonicTemporalBypass: true },
    });
    expect(result.bypassTemporal).toBe(true);
    expect(result.effectiveTemporal).toBeNull();
  });

  it('modulates temporal settings when descriptor bypass is off', () => {
    const manual = createDefaultBeatSonicTemporalState();
    const result = resolveBeatAudioRouting({
      sonicTemporal: manual,
      descriptorGraph: {
        descriptors: {
          Dreaminess: { value: 0.95 },
          Persistence: { value: 0.9 },
        },
      },
      audioRouting: { descriptorGraphBypass: false, descriptorMacroDepth: 1 },
    });
    expect(result.effectiveTemporal.delay.wet).toBeGreaterThan(manual.delay.wet);
  });
});

describe('resolveBeatSpaceRouting', () => {
  it('bypasses acoustic space when acousticSpaceBypass is true', () => {
    const result = resolveBeatSpaceRouting({
      spaceState: createDefaultSpaceState({ roomIdentity: 'hall' }),
      audioRouting: { acousticSpaceBypass: true },
    });
    expect(result.bypassSpace).toBe(true);
    expect(result.fdnParams).toBeNull();
  });

  it('bypasses void room identity', () => {
    const result = resolveBeatSpaceRouting({
      spaceState: createDefaultSpaceState({ roomIdentity: 'void' }),
    });
    expect(result.bypassSpace).toBe(true);
    expect(result.fdnParams?.enabled).toBe(false);
  });

  it('maps hall space to enabled FDN params', () => {
    const result = resolveBeatSpaceRouting({
      spaceState: createDefaultSpaceState({ roomIdentity: 'hall', roomSize: 0.8 }),
    });
    expect(result.bypassSpace).toBe(false);
    expect(result.fdnParams.enabled).toBe(true);
    expect(result.fdnParams.wet).toBeGreaterThan(0.2);
  });

  it('modulates space from descriptors when bypass is off', () => {
    const base = createDefaultSpaceState({ roomSize: 0.35 });
    const result = resolveBeatSpaceRouting({
      spaceState: base,
      descriptorGraph: {
        descriptors: {
          Space: { value: 0.95 },
          Dreaminess: { value: 0.9 },
          Brightness: { value: 0.2 },
        },
      },
      audioRouting: { descriptorGraphBypass: false },
    });
    expect(result.effectiveSpace.roomSize).toBeGreaterThan(base.roomSize);
  });

  it('accepts null space state', () => {
    const result = resolveBeatSpaceRouting({ spaceState: null });
    expect(result.bypassSpace).toBe(false);
    expect(result.fdnParams?.enabled).toBe(true);
  });

  it('separates plate and chamber reverb character', () => {
    const plate = mapSpaceStateToFdnParams(createDefaultSpaceState({ roomIdentity: 'plate' }));
    const chamber = mapSpaceStateToFdnParams(createDefaultSpaceState({ roomIdentity: 'chamber' }));
    expect(plate.delayScale).toBeLessThan(chamber.delayScale);
    expect(plate.predelayMs).toBeLessThan(chamber.predelayMs);
    expect(plate.damping).toBeLessThan(chamber.damping);
    expect(plate.inputDiffusion).toBeGreaterThan(chamber.inputDiffusion);
    expect(plate.feedback).toBeGreaterThan(chamber.feedback * 0.95);
  });
});

describe('mapSpaceStateToFdnParams', () => {
  it('returns disabled params for void room', () => {
    const params = mapSpaceStateToFdnParams(createDefaultSpaceState({ roomIdentity: 'void' }));
    expect(params.enabled).toBe(false);
    expect(params.wet).toBe(0);
  });

  it('accepts null space state', () => {
    const params = mapSpaceStateToFdnParams(null);
    expect(params.enabled).toBe(true);
    expect(params.wet).toBeGreaterThan(0);
  });
});

describe('mapSonicTemporalToWorkletState', () => {
  it('maps shimmer enabled to shimmer topology', () => {
    const params = mapSonicTemporalToWorkletState({
      enabled: true,
      delay: { enabled: true, delayMs: 240, feedback: 0.28, wet: 0.18, damping: 0.3 },
      shimmer: { enabled: true, pitchRatio: 2, feedback: 0.48, wet: 0.22, damping: 0.28 },
      freeze: { enabled: false, wet: 0.35, feedback: 0.995 },
    });
    expect(params.topology).toBe('shimmer');
  });
});

describe('beatTrackSoundSource', () => {
  it('resolves default kit voices from slim sonic cards missing inline state', () => {
    const voices = getSonicStudioCardVoices({
      id: 'sonic-card-1',
      type: 'sonic_studio',
      name: 'Sonic Studio 1',
    });
    expect(voices.length).toBeGreaterThan(0);
    expect(voices.map((voice) => voice.archetype)).toEqual(
      expect.arrayContaining(['kick', 'snare', 'hat', 'cymbal']),
    );
  });

  it('assigns and clears sonic voice metadata', () => {
    const track = { id: 'kick', role: 'kick', name: 'Kick' };
    const voice = { id: 'kick-voice', archetype: 'kick', name: 'Custom Kick' };
    const assigned = assignSonicVoiceToTrack(track, {
      voice,
      cardId: 'sonic-1',
      voiceId: voice.id,
      stateHash: 'abc',
    });
    expect(assigned.soundSource).toBe('sonic_voice');
    expect(clearTrackSonicVoice(assigned).soundSource).toBe('generated');
  });

  it('preserves track gain when assigning sonic voice', () => {
    const track = {
      id: 'snare',
      role: 'snare',
      name: 'Snare',
      synth: { gain: 0.42, attackMs: 2, decayMs: 160, pitch: 0, tone: 0.5, distortion: 0.08 },
      gain: 0.42,
    };
    const assigned = assignSonicVoiceToTrack(track, {
      voice: { id: 'snare-voice', archetype: 'snare' },
      cardId: 'sonic-1',
      voiceId: 'snare-voice',
      stateHash: 'abc',
    });
    expect(assigned.synth.gain).toBe(0.42);
    expect(assigned.gain).toBe(0.42);
  });
});

describe('beatTrackSampleSignature', () => {
  it('includes sonic voice provenance in signature', () => {
    const signature = beatTrackSampleSignature({
      id: 'kick',
      role: 'kick',
      soundSource: 'sonic_voice',
      sonicVoice: { id: 'v1' },
      sonicProvenance: { stateHash: 'hash-1', renderedAssetId: 'asset-1' },
    });
    expect(signature).toContain('sonic_voice');
    expect(signature).toContain('hash-1');
    expect(signature).toContain('asset-1');
  });

  it('changes signature when inline embedded voice is edited', () => {
    const assigned = assignEmbeddedSonicToTrack({ id: 'kick', role: 'kick', name: 'Kick' });
    const before = beatTrackSampleSignature(assigned);
    const edited = updateTrackSonicVoice(assigned, { material: { brightness: 0.95 } });
    const after = beatTrackSampleSignature(edited);
    expect(after).not.toBe(before);
    expect(edited.sonicProvenance.renderedAssetId).toBeNull();
  });

  it('prefers baked rendered assets when available', () => {
    const track = assignSonicVoiceToTrack(
      { id: 'kick', role: 'kick', name: 'Kick' },
      {
        voice: { id: 'kick-voice', archetype: 'kick' },
        cardId: 'sonic-card-1',
        voiceId: 'kick-voice',
        stateHash: 'hash-1',
        renderedAssetId: 'asset-1',
      },
    );
    const cards = [{
      id: 'sonic-card-1',
      type: 'sonic_studio',
      sonicRenderedAssets: [{
        id: 'asset-1',
        voiceId: 'kick-voice',
        sourceStateHash: 'hash-1',
        sampleRate: 48000,
        channels: { left: [0.25, 0.5], right: [0.25, 0.5] },
      }],
    }];
    const rendered = resolveBeatTrackSample(track, { cards });
    expect(rendered.source).toBe('rendered_asset');
    expect(rendered.left[0]).toBeCloseTo(0.25);
  });
});

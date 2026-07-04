import { describe, expect, it } from 'vitest';
import { MusicAudioTransportService } from '../../../../transport/MusicAudioTransportService.js';
import {
  ensureBeatPreviewTransport,
  resolveBeatAudioTransport,
} from '../beatPreviewTransport.js';

describe('beatPreviewTransport', () => {
  it('creates one preview transport per runtime entry', () => {
    const audioEngine = { ensureContext: async () => ({ sampleRate: 48000 }) };
    const entry = { previewTransport: null };
    const first = ensureBeatPreviewTransport(entry, audioEngine);
    const second = ensureBeatPreviewTransport(entry, audioEngine);
    expect(first).toBe(second);
    expect(first).toBeInstanceOf(MusicAudioTransportService);
  });

  it('uses shared transport only when clock sync is enabled', () => {
    const audioEngine = { ensureContext: async () => ({ sampleRate: 48000 }) };
    const entry = { previewTransport: null };
    const sharedTransport = { id: 'shared' };
    const preview = ensureBeatPreviewTransport(entry, audioEngine);

    expect(resolveBeatAudioTransport(entry, {
      clockSync: false,
      sharedTransport,
      audioEngine,
    })).toBe(preview);
    expect(resolveBeatAudioTransport(entry, {
      clockSync: true,
      sharedTransport,
      audioEngine,
    })).toBe(sharedTransport);
  });
});

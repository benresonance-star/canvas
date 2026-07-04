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

  it('always uses the per-agent preview transport for audio routing', () => {
    const audioEngine = { ensureContext: async () => ({ sampleRate: 48000 }) };
    const entry = { previewTransport: null };
    const sharedTransport = { id: 'shared' };
    const preview = ensureBeatPreviewTransport(entry, audioEngine);

    expect(resolveBeatAudioTransport(entry, {
      audioEngine,
    })).toBe(preview);
    expect(resolveBeatAudioTransport(entry, {
      audioEngine,
    })).not.toBe(sharedTransport);
  });
});

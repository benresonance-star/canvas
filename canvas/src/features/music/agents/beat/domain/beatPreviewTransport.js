import { MusicAudioTransportService } from '../../../transport/MusicAudioTransportService.js';

export function ensureBeatPreviewTransport(entry, audioEngine) {
  if (!entry.previewTransport) {
    entry.previewTransport = new MusicAudioTransportService({ audioEngine });
  }
  return entry.previewTransport;
}

export function resolveBeatAudioTransport(entry, { clockSync, sharedTransport, audioEngine }) {
  if (clockSync) return sharedTransport;
  return ensureBeatPreviewTransport(entry, audioEngine);
}

export function stopBeatPreviewTransport(entry) {
  entry?.previewTransport?.stop();
}

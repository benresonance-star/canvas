import { MusicAudioTransportService } from '../../../transport/MusicAudioTransportService.js';

export function ensureBeatPreviewTransport(entry, audioEngine) {
  if (!entry.previewTransport) {
    entry.previewTransport = new MusicAudioTransportService({ audioEngine });
  }
  return entry.previewTransport;
}

export function resolveBeatAudioTransport(entry, { audioEngine }) {
  return ensureBeatPreviewTransport(entry, audioEngine);
}

export function stopBeatPreviewTransport(entry) {
  entry?.previewTransport?.stop();
}

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('jsmediatags', () => ({
  default: {
    read: (file, { onSuccess, onError }) => {
      if (file.name === 'tagged.mp3') {
        onSuccess({
          tags: {
            title: 'Tagged Title',
            artist: 'Tagged Artist',
            album: 'Tagged Album',
            length: 125000,
          },
        });
        return;
      }
      onError();
    },
  },
}));

const { titleFromFilename, parseAudioTags, formatDurationSec } = await import('../parseAudioTags.js');

describe('titleFromFilename', () => {
  it('parses Artist - Title pattern', () => {
    expect(titleFromFilename('Artist Name - Song Title.mp3')).toEqual({
      artist: 'Artist Name',
      title: 'Song Title',
    });
  });

  it('uses whole basename when no separator', () => {
    expect(titleFromFilename('MyTrack.mp3')).toEqual({
      title: 'MyTrack',
      artist: undefined,
    });
  });
});

describe('parseAudioTags', () => {
  it('reads ID3 tags when present', async () => {
    const file = new File(['x'], 'tagged.mp3', { type: 'audio/mpeg' });
    const meta = await parseAudioTags(file);
    expect(meta.title).toBe('Tagged Title');
    expect(meta.artist).toBe('Tagged Artist');
    expect(meta.album).toBe('Tagged Album');
    expect(meta.durationSec).toBe(125);
  });

  it('falls back to filename when tags missing', async () => {
    const file = new File(['x'], 'Fallback Artist - Fallback Song.mp3', { type: 'audio/mpeg' });
    const meta = await parseAudioTags(file);
    expect(meta.artist).toBe('Fallback Artist');
    expect(meta.title).toBe('Fallback Song');
  });

  it('uses fallbackTitle when needed', async () => {
    const file = new File(['x'], 'plain.mp3', { type: 'audio/mpeg' });
    const meta = await parseAudioTags(file, { fallbackTitle: 'Card Name' });
    expect(meta.title).toBe('plain');
  });
});

describe('formatDurationSec', () => {
  it('formats minutes and seconds', () => {
    expect(formatDurationSec(125)).toBe('2:05');
    expect(formatDurationSec(0)).toBe('0:00');
  });
});

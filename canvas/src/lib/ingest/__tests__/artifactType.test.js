import { describe, expect, it } from 'vitest';
import {
  artifactTypeFromCardType,
  artifactTypeFromFile,
} from '../artifactType.js';

describe('artifactTypeFromCardType', () => {
  it('maps bookmark to other for primitives', () => {
    expect(artifactTypeFromCardType('bookmark', 'url')).toBe('other');
  });

  it('maps audio and video card types', () => {
    expect(artifactTypeFromCardType('audio', 'mp3')).toBe('audio');
    expect(artifactTypeFromCardType('video', 'mp4')).toBe('video');
  });

  it('maps generic file by extension', () => {
    expect(artifactTypeFromCardType('file', 'mp3')).toBe('audio');
    expect(artifactTypeFromCardType('file', 'mp4')).toBe('video');
  });
});

describe('artifactTypeFromFile', () => {
  it('infers audio and video from filenames', () => {
    expect(artifactTypeFromFile('track.mp3')).toBe('audio');
    expect(artifactTypeFromFile('clip.mp4')).toBe('video');
    expect(artifactTypeFromFile('photo.png')).toBe('image');
  });
});

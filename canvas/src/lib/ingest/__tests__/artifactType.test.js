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

  it('maps 3D model cards to 3d_model artifacts', () => {
    expect(artifactTypeFromCardType('3d-model', 'glb')).toBe('3d_model');
  });

  it('maps BIM model cards to bim_model artifacts', () => {
    expect(artifactTypeFromCardType('bim-model', 'ifc')).toBe('bim_model');
  });

  it('maps generic file by extension', () => {
    expect(artifactTypeFromCardType('file', 'mp3')).toBe('audio');
    expect(artifactTypeFromCardType('file', 'mp4')).toBe('video');
  });

  it('maps code cards to document artifacts', () => {
    expect(artifactTypeFromCardType('code', 'ts')).toBe('doc');
    expect(artifactTypeFromCardType('code', 'json')).toBe('doc');
    expect(artifactTypeFromCardType('code', 'py')).toBe('doc');
  });
});

describe('artifactTypeFromFile', () => {
  it('infers audio and video from filenames', () => {
    expect(artifactTypeFromFile('track.mp3')).toBe('audio');
    expect(artifactTypeFromFile('clip.mp4')).toBe('video');
    expect(artifactTypeFromFile('photo.png')).toBe('image');
    expect(artifactTypeFromFile('source.ts')).toBe('doc');
    expect(artifactTypeFromFile('settings.json')).toBe('doc');
    expect(artifactTypeFromFile('script.py')).toBe('doc');
    expect(artifactTypeFromFile('chair.glb')).toBe('3d_model');
    expect(artifactTypeFromFile('clinic.ifc')).toBe('bim_model');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const storage = new Map();

function installLocalStorageMock() {
  vi.stubGlobal('localStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  });
}

import {
  AUDIO_SKIN_STORAGE_KEY,
  addFavoriteColor,
  audioSkinUsesDarkText,
  getDefaultAudioSkinColor,
  loadAudioSkinPrefs,
  normalizeAudioSkinColor,
  removeFavoriteColor,
  resolveAudioSkinColor,
  saveAudioSkinPrefs,
  setDefaultAudioSkinColor,
} from '../audioSkin.js';

describe('normalizeAudioSkinColor', () => {
  it('normalizes 3-digit hex', () => {
    expect(normalizeAudioSkinColor('#abc')).toBe('#aabbcc');
  });

  it('rejects invalid values', () => {
    expect(normalizeAudioSkinColor('red')).toBeNull();
    expect(normalizeAudioSkinColor('')).toBeNull();
  });
});

describe('audioSkinUsesDarkText', () => {
  it('detects light backgrounds', () => {
    expect(audioSkinUsesDarkText('#ffffff')).toBe(true);
    expect(audioSkinUsesDarkText('#1a1a2e')).toBe(false);
  });
});

describe('audio skin prefs storage', () => {
  beforeEach(() => {
    storage.clear();
    installLocalStorageMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists favorites and default', () => {
    saveAudioSkinPrefs({ favorites: ['#111111'], defaultColor: '#222222' });
    expect(loadAudioSkinPrefs()).toEqual({
      favorites: ['#111111'],
      defaultColor: '#222222',
    });
    expect(localStorage.getItem(AUDIO_SKIN_STORAGE_KEY)).toBeTruthy();
  });

  it('adds and removes favorites', () => {
    addFavoriteColor('#aabbcc');
    addFavoriteColor('#aabbcc');
    expect(loadAudioSkinPrefs().favorites).toEqual(['#aabbcc']);
    removeFavoriteColor('#aabbcc');
    expect(loadAudioSkinPrefs().favorites).toEqual([]);
  });

  it('sets default for new cards', () => {
    setDefaultAudioSkinColor('#334455');
    expect(getDefaultAudioSkinColor()).toBe('#334455');
  });
});

describe('resolveAudioSkinColor', () => {
  beforeEach(() => {
    storage.clear();
    installLocalStorageMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers card color over default', () => {
    setDefaultAudioSkinColor('#111111');
    expect(resolveAudioSkinColor({ audioSkinColor: '#222222' })).toBe('#222222');
  });

  it('falls back to default', () => {
    setDefaultAudioSkinColor('#111111');
    expect(resolveAudioSkinColor({})).toBe('#111111');
  });
});

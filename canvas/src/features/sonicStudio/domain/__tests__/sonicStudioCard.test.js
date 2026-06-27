import { describe, expect, it } from 'vitest';
import {
  addSonicSavePoint,
  buildSonicStudioCardPatch,
  createDefaultSonicStudioState,
  createSonicStudioRecord,
  loadSonicSavePoint,
  morphBetweenSonicSavePoints,
  sonicStudioCardFromRecord,
  updateSonicVoiceFromSpace,
  updateSonicVoice,
} from '../sonicStudioCard.js';
import { analyzePreviewBuffer, renderSonicStudioVoicePreview } from '../sonicStudioAudition.js';

describe('sonicStudioCard', () => {
  it('creates a persisted Sonic Studio card with default percussion voices', () => {
    const record = createSonicStudioRecord({
      id: 'sonic-1',
      projectId: 'project-1',
      name: 'Percussion Space',
    });
    const card = sonicStudioCardFromRecord(record, { x: 12, y: 34 });

    expect(card.type).toBe('sonic_studio');
    expect(card.sonicStudioId).toBe('sonic-1');
    expect(card.sonicStudioState.voices.map((voice) => voice.archetype)).toEqual([
      'kick',
      'snare',
      'hat',
      'cymbal',
    ]);
    expect(card.versions[0].artifactRef).toEqual({ id: 'sonic-1', type: 'artifact' });
    expect(card.x).toBe(12);
    expect(card.y).toBe(34);
  });

  it('updates voices and changes the source state hash', () => {
    const state = createDefaultSonicStudioState();
    const kick = state.voices.find((voice) => voice.archetype === 'kick');
    const before = buildSonicStudioCardPatch(state);
    const updated = updateSonicVoice(state, kick.id, {
      material: { brightness: 0.91 },
      output: { gain: 0.42 },
    });
    const after = buildSonicStudioCardPatch(updated);

    expect(updated.voices.find((voice) => voice.id === kick.id).material.brightness).toBe(0.91);
    expect(updated.voices.find((voice) => voice.id === kick.id).output.gain).toBe(0.42);
    expect(after.sonicSourceStateHash).not.toBe(before.sonicSourceStateHash);
  });

  it('stores full save points and morphs safely between them', () => {
    const state = createDefaultSonicStudioState();
    const kick = state.voices.find((voice) => voice.archetype === 'kick');
    const cymbal = state.voices.find((voice) => voice.archetype === 'cymbal');
    const withKick = addSonicSavePoint(state, kick.id, { id: 'save-kick', name: 'Kick' });
    const withBoth = addSonicSavePoint(withKick, cymbal.id, { id: 'save-cymbal', name: 'Cymbal' });
    const morphed = morphBetweenSonicSavePoints(withBoth, 'save-kick', 'save-cymbal', 0.5);

    expect(withBoth.savePoints).toHaveLength(2);
    expect(withBoth.savePoints[0].fullState.id).toBe(kick.id);
    expect(morphed.voices[0].body.resonance).toBeGreaterThanOrEqual(0);
    expect(morphed.voices[0].body.resonance).toBeLessThanOrEqual(1);
    expect(Number.isFinite(morphed.voices[0].material.brightness)).toBe(true);
  });

  it('loads saved presets into the selected voice', () => {
    const state = createDefaultSonicStudioState();
    const kick = state.voices.find((voice) => voice.archetype === 'kick');
    const snare = state.voices.find((voice) => voice.archetype === 'snare');
    const edited = updateSonicVoice(state, kick.id, { material: { brightness: 0.12 } });
    const withSave = addSonicSavePoint(edited, kick.id, { id: 'warm-kick', name: 'Warm Kick' });
    const loaded = loadSonicSavePoint(withSave, 'warm-kick', snare.id);
    const loadedSnare = loaded.voices.find((voice) => voice.id === snare.id);

    expect(loadedSnare.id).toBe(snare.id);
    expect(loadedSnare.material.brightness).toBe(0.12);
    expect(loadedSnare.archetype).toBe('kick');
  });

  it('moves the Sonic Space tracker by mapping XY to voice parameters', () => {
    const state = createDefaultSonicStudioState();
    const kick = state.voices.find((voice) => voice.archetype === 'kick');
    const moved = updateSonicVoiceFromSpace(state, kick.id, { x: 1, y: 1 });
    const movedKick = moved.voices.find((voice) => voice.id === kick.id);

    expect(movedKick.material.brightness).toBe(1);
    expect(movedKick.material.hardness).toBe(1);
    expect(movedKick.body.resonance).toBe(1);
    expect(movedKick.body.damping).toBe(1);
    expect(movedKick.contact.friction).toBe(1);
    expect(movedKick.output.gain).toBe(1);
  });

  it('maps bottom-left Sonic Space to zeroed visible controls', () => {
    const state = createDefaultSonicStudioState();
    const kick = state.voices.find((voice) => voice.archetype === 'kick');
    const moved = updateSonicVoiceFromSpace(state, kick.id, { x: -1, y: -1 });
    const movedKick = moved.voices.find((voice) => voice.id === kick.id);

    expect(movedKick.material.brightness).toBe(0);
    expect(movedKick.material.hardness).toBe(0);
    expect(movedKick.body.resonance).toBe(0);
    expect(movedKick.body.damping).toBe(0);
    expect(movedKick.contact.friction).toBe(0);
    expect(movedKick.output.gain).toBe(0);
  });

  it('morphs saved presets into a selected target voice id', () => {
    const state = createDefaultSonicStudioState();
    const kick = state.voices.find((voice) => voice.archetype === 'kick');
    const cymbal = state.voices.find((voice) => voice.archetype === 'cymbal');
    const withKick = addSonicSavePoint(state, kick.id, { id: 'save-kick' });
    const withBoth = addSonicSavePoint(withKick, cymbal.id, { id: 'save-cymbal' });
    const morphed = morphBetweenSonicSavePoints(withBoth, 'save-kick', 'save-cymbal', 0.5, {
      targetVoiceId: kick.id,
    });

    expect(morphed.voices.some((voice) => voice.id === kick.id)).toBe(true);
    expect(morphed.voices.filter((voice) => voice.id === kick.id)).toHaveLength(1);
    expect(morphed.voices.find((voice) => voice.id === kick.id).name).toBe(kick.name);
  });

  it('renders finite non-silent voice previews for interaction', () => {
    const state = createDefaultSonicStudioState();
    const voice = state.voices.find((entry) => entry.archetype === 'snare');
    const preview = renderSonicStudioVoicePreview({
      voice,
      engineState: state,
      sampleRate: 8000,
      seed: 42,
    });
    const stats = analyzePreviewBuffer(preview.buffer);

    expect(preview.buffer[0].length).toBeGreaterThan(0);
    expect(stats.nonSilent).toBe(true);
    expect(stats.peak).toBeLessThanOrEqual(1);
  });
});

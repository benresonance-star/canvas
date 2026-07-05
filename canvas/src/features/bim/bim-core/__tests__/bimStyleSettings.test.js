import { describe, expect, it } from 'vitest';
import {
  applyBimStyleSettings,
  extractBimStyleSettings,
  normalizeBimStyleSettings,
  BIM_STYLE_SETTINGS_SCHEMA_VERSION,
} from '../bimStyleSettings.js';
import { normalizeBimWorkspaceState } from '../types.js';

describe('bimStyleSettings', () => {
  it('normalizes a versioned style schema payload', () => {
    const style = normalizeBimStyleSettings({
      renderStyle: 'clay',
      clayAoIntensity: 42,
      wireframeMode: true,
      viewportBackgroundColor: '#ffffff',
    });
    expect(style.schemaVersion).toBe(BIM_STYLE_SETTINGS_SCHEMA_VERSION);
    expect(style.renderStyle).toBe('clay');
    expect(style.clayAoIntensity).toBe(42);
    expect(style.wireframeMode).toBe(true);
    expect(style.viewportBackgroundColor).toBe('#ffffff');
  });

  it('extracts style fields from workspace state', () => {
    const workspace = normalizeBimWorkspaceState({
      renderStyle: 'clay',
      clayAoIntensity: 15,
      selectedObjectId: 'wall-1',
      camera: { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] },
    });
    const style = extractBimStyleSettings(workspace);
    expect(style.clayAoIntensity).toBe(15);
    expect(style.selectedObjectId).toBeUndefined();
  });

  it('persists ghost display mode and isolate-on-select in style settings', () => {
    const style = normalizeBimStyleSettings({
      displayMode: 'ghostOthers',
      isolateOnSelect: true,
      renderStyle: 'clay',
    });
    expect(style.displayMode).toBe('ghostOthers');
    expect(style.isolateOnSelect).toBe(true);

    const migrated = normalizeBimStyleSettings({ displayMode: 'isolate' });
    expect(migrated.displayMode).toBe('highlight');
    expect(migrated.isolateOnSelect).toBe(false);

    const fromQueryMode = normalizeBimStyleSettings({ displayMode: 'colorBy' });
    expect(fromQueryMode.displayMode).toBe('highlight');
  });

  it('applies saved isolate-on-select from style presets', () => {
    const patch = applyBimStyleSettings(
      { displayMode: 'ghostOthers', isolateOnSelect: false },
      { isolateOnSelect: true },
    );
    expect(patch.displayMode).toBe('ghostOthers');
    expect(patch.isolateOnSelect).toBe(true);
  });

  it('applies saved style settings without touching non-style workspace fields', () => {
    const workspace = normalizeBimWorkspaceState({
      selectedObjectId: 'wall-1',
      clayAoIntensity: 10,
    });
    const patch = applyBimStyleSettings(workspace, { clayAoIntensity: 80, renderStyle: 'clay' });
    expect(patch.clayAoIntensity).toBe(80);
    expect(patch.renderStyle).toBe('clay');
    expect(patch.selectedObjectId).toBeUndefined();
  });
});

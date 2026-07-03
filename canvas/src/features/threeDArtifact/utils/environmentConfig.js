/** HDRI filenames from @react-three/drei presets (pmndrs/drei-assets). */
export const ENVIRONMENT_PRESET_FILES = {
  studio: 'studio_small_03_1k.hdr',
  city: 'potsdamer_platz_1k.hdr',
  sunset: 'venice_sunset_1k.hdr',
};

export const DREI_HDRI_ROOT =
  'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/';

const ENVIRONMENT_SETTINGS = {
  studio: { preset: 'studio', environmentIntensity: 0.7, background: false },
  city: { preset: 'city', environmentIntensity: 0.85, background: false },
  sunset: { preset: 'sunset', environmentIntensity: 0.45, background: false },
};

/**
 * @param {'studio' | 'bright' | 'soft'} lightingMode
 * @returns {'studio' | 'city' | 'sunset'}
 */
export function environmentPresetForLightingMode(lightingMode) {
  if (lightingMode === 'bright') return 'city';
  if (lightingMode === 'soft') return 'sunset';
  return 'studio';
}

/**
 * @param {'studio' | 'city' | 'sunset'} preset
 * @returns {'studio' | 'bright' | 'soft'}
 */
export function lightingModeForEnvironmentPreset(preset) {
  if (preset === 'city') return 'bright';
  if (preset === 'sunset') return 'soft';
  return 'studio';
}

/**
 * @param {{ environmentPreset?: string | null, lightingMode?: string | null } | null | undefined} viewerState
 * @returns {'studio' | 'city' | 'sunset'}
 */
export function resolveEnvironmentPreset(viewerState) {
  const preset = viewerState?.environmentPreset;
  if (preset && preset in ENVIRONMENT_SETTINGS) return preset;
  return environmentPresetForLightingMode(viewerState?.lightingMode ?? 'studio');
}

/**
 * @param {'studio' | 'city' | 'sunset'} preset
 */
export function environmentSettingsForPreset(preset) {
  return ENVIRONMENT_SETTINGS[preset] ?? ENVIRONMENT_SETTINGS.studio;
}

/**
 * @param {'studio' | 'bright' | 'soft'} lightingMode
 */
export function environmentSettingsForLightingMode(lightingMode) {
  return environmentSettingsForPreset(environmentPresetForLightingMode(lightingMode));
}

/**
 * @param {'studio' | 'city' | 'sunset'} preset
 * @returns {string | null}
 */
export function environmentHdriUrl(preset) {
  const filename = ENVIRONMENT_PRESET_FILES[preset];
  if (!filename) return null;
  return `${DREI_HDRI_ROOT}${filename}`;
}

/**
 * Direct-light intensities paired with each lighting mode (IBL is additive).
 * @param {'studio' | 'bright' | 'soft'} mode
 */
export function lightingForMode(mode) {
  if (mode === 'bright') {
    return {
      ambient: 0.85,
      hemi: 1.25,
      key: 2.25,
      fill: 1.1,
      rim: 1.45,
    };
  }
  if (mode === 'soft') {
    return {
      ambient: 0.55,
      hemi: 0.8,
      key: 1.25,
      fill: 0.65,
      rim: 0.75,
    };
  }
  return {
    ambient: 0.65,
    hemi: 1,
    key: 1.75,
    fill: 0.9,
    rim: 1.1,
  };
}

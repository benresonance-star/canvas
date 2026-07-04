import {
  lightingModeForEnvironmentPreset,
} from '../../threeDArtifact/utils/environmentConfig.js';

export const BIM_LIGHTING_MODES = ['studio', 'bright', 'soft'];
export const BIM_ENVIRONMENT_PRESETS = ['studio', 'city', 'sunset'];

/**
 * @param {{ showEnvironment?: boolean, environmentPreset?: string, lightingMode?: string }} state
 */
export function cycleBimLightingState(state = {}) {
  const showEnvironment = state.showEnvironment === true;
  const environmentPreset = BIM_ENVIRONMENT_PRESETS.includes(state.environmentPreset)
    ? state.environmentPreset
    : 'studio';

  if (!showEnvironment) {
    return {
      showEnvironment: true,
      environmentPreset: 'studio',
      lightingMode: 'studio',
    };
  }
  if (environmentPreset === 'studio') {
    return {
      showEnvironment: true,
      environmentPreset: 'city',
      lightingMode: 'bright',
    };
  }
  if (environmentPreset === 'city') {
    return {
      showEnvironment: true,
      environmentPreset: 'sunset',
      lightingMode: 'soft',
    };
  }
  return {
    showEnvironment: false,
    environmentPreset: 'studio',
    lightingMode: 'studio',
  };
}

/**
 * @param {{ showEnvironment?: boolean, environmentPreset?: string }} state
 */
export function bimLightingToolbarLabel(state = {}) {
  if (state.showEnvironment !== true) {
    return 'Lighting: off';
  }
  const preset = BIM_ENVIRONMENT_PRESETS.includes(state.environmentPreset)
    ? state.environmentPreset
    : 'studio';
  return `Lighting: ${preset} (HDRI)`;
}

/**
 * @param {{ environmentPreset?: string, lightingMode?: string }} state
 */
export function normalizeBimLightingState(state = {}) {
  const environmentPreset = BIM_ENVIRONMENT_PRESETS.includes(state.environmentPreset)
    ? state.environmentPreset
    : 'studio';
  const lightingMode = BIM_LIGHTING_MODES.includes(state.lightingMode)
    ? state.lightingMode
    : lightingModeForEnvironmentPreset(environmentPreset);
  return {
    showEnvironment: state.showEnvironment === true,
    environmentPreset,
    lightingMode,
  };
}

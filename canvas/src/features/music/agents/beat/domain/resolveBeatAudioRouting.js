import {
  createDefaultBeatAudioRouting,
  createDefaultBeatMixSettings,
  createDefaultBeatSonicTemporalState,
  createDefaultSpaceState,
  deriveSonicTemporalFromDescriptors,
  deriveSpaceFromDescriptors,
  mapSpaceStateToFdnParams,
  normalizeSonicTemporal,
} from '../../../../../../packages/music-core/src/index.js';

export function resolveBeatAudioRouting({
  sonicTemporal,
  descriptorGraph,
  audioRouting,
} = {}) {
  const routing = createDefaultBeatAudioRouting(audioRouting);
  const manual = normalizeSonicTemporal(sonicTemporal ?? createDefaultBeatSonicTemporalState());

  if (routing.sonicTemporalBypass || !manual.enabled) {
    return {
      bypassTemporal: true,
      effectiveTemporal: null,
      routing,
    };
  }

  const effectiveTemporal = routing.descriptorGraphBypass
    ? manual
    : deriveSonicTemporalFromDescriptors(manual, descriptorGraph, {
      macroDepth: routing.descriptorMacroDepth,
    });

  return {
    bypassTemporal: false,
    effectiveTemporal,
    routing,
  };
}

export function resolveBeatMixSettings(mixSettings) {
  return createDefaultBeatMixSettings(mixSettings);
}

export function resolveBeatSpaceRouting({
  spaceState,
  descriptorGraph,
  audioRouting,
} = {}) {
  const routing = createDefaultBeatAudioRouting(audioRouting);
  if (routing.acousticSpaceBypass) {
    return {
      bypassSpace: true,
      effectiveSpace: null,
      fdnParams: null,
      routing,
    };
  }

  const base = createDefaultSpaceState(spaceState);
  const effectiveSpace = routing.descriptorGraphBypass
    ? base
    : deriveSpaceFromDescriptors(base, descriptorGraph);
  const fdnParams = mapSpaceStateToFdnParams(effectiveSpace);

  return {
    bypassSpace: !fdnParams.enabled,
    effectiveSpace,
    fdnParams,
    routing,
  };
}

export function beatAudioRoutingSignature({
  sonicTemporal,
  spaceState,
  descriptorGraph,
  audioRouting,
  mixSettings,
} = {}) {
  return JSON.stringify({
    sonicTemporal: normalizeSonicTemporal(sonicTemporal),
    spaceState: createDefaultSpaceState(spaceState),
    descriptorGraph: descriptorGraph?.updatedAt ?? descriptorGraph,
    audioRouting: createDefaultBeatAudioRouting(audioRouting),
    mixSettings: resolveBeatMixSettings(mixSettings),
  });
}

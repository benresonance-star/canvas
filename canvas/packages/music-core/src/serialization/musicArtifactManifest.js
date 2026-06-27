export const MUSIC_ARTIFACT_FORMAT = 'canvas.musicartifact';
export const MUSIC_ARTIFACT_FORMAT_VERSION = '1.0.0';

export function createMusicArtifactManifest({
  agentType,
  agentVersion = '1.0.0',
  sourceProjectId = null,
  sourceAgentId = null,
  files = [],
  dependencies = {},
} = {}) {
  return {
    format: MUSIC_ARTIFACT_FORMAT,
    formatVersion: MUSIC_ARTIFACT_FORMAT_VERSION,
    artifactType: 'music-agent',
    agentType,
    agentVersion,
    createdAt: new Date().toISOString(),
    sourceProjectId,
    sourceAgentId,
    files,
    dependencies: {
      samples: [],
      presets: [],
      ...dependencies,
    },
  };
}

export function validateMusicArtifactManifest(manifest) {
  if (manifest?.format !== MUSIC_ARTIFACT_FORMAT) {
    return { ok: false, reason: 'unsupported music artifact format' };
  }
  if (manifest.formatVersion !== MUSIC_ARTIFACT_FORMAT_VERSION) {
    return { ok: false, reason: 'unsupported music artifact version' };
  }
  if (manifest.artifactType !== 'music-agent' || !manifest.agentType) {
    return { ok: false, reason: 'invalid music agent manifest' };
  }
  return { ok: true };
}

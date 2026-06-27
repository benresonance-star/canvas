import { createMusicArtifactManifest } from '../../../../packages/music-core/src/index.js';

export function exportBeatAgentPackage(agent) {
  const manifest = createMusicArtifactManifest({
    agentType: 'beat',
    sourceProjectId: agent.projectId,
    sourceAgentId: agent.id,
    files: [
      { path: 'agent.json', kind: 'agent-state' },
      { path: 'patterns/current.pattern.json', kind: 'pattern' },
    ],
  });
  return {
    manifest,
    files: {
      'manifest.json': manifest,
      'agent.json': agent,
      'patterns/current.pattern.json': agent.state?.pattern ?? agent.pattern,
    },
  };
}

export function downloadMusicArtifactPackage(agent) {
  const pkg = exportBeatAgentPackage(agent);
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${agent.name || 'beat-agent'}.musicartifact.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

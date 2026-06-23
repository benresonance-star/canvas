export const IMAGE_GENERATION_AGENT_TYPE_ID = 'agent_type_image_generation';

export const DEFAULT_IMAGE_AGENT_SETTINGS = Object.freeze({
  provider: 'local',
  aspectRatio: '1:1',
  quality: 'standard',
  imageCount: 1,
  outputFormat: 'png',
});

export function agentCardFromRecord(agent, position = { x: 100, y: 100 }) {
  return {
    id: crypto.randomUUID(),
    key: `agent__${agent.id}`,
    prefix: 'agent',
    name: agent.name,
    type: 'agent',
    agentArtifactId: agent.id,
    agentTypeId: agent.agentTypeId,
    projectId: agent.projectId,
    x: position.x,
    y: position.y,
    w: 240,
    h: 240,
    versions: [{
      version: 1,
      artifactRef: { id: agent.id, type: 'artifact' },
      agentArtifactId: agent.id,
      inline: true,
      ext: 'agent',
      filename: `agent__${agent.id}.agent`,
    }],
    pinnedVersion: 1,
  };
}

export function generatedImageCardFromOutput(output, position = { x: 120, y: 120 }) {
  const filename = output.filename || output.filePath?.split('/').pop() || `generated__${output.id}.png`;
  const ext = filename.split('.').pop()?.toLowerCase() || 'png';
  return {
    id: crypto.randomUUID(),
    key: `generated__${output.id}`,
    prefix: 'generated',
    name: filename.replace(/\.[^.]+$/, ''),
    type: 'image',
    x: position.x,
    y: position.y,
    w: 280,
    h: 220,
    versions: [{
      version: 1,
      artifactRef: { id: output.id, type: 'artifact' },
      filename,
      relativePath: output.filePath?.replace(/^projects\/[^/]+\//, '') ?? null,
      content_hash: output.contentHash,
      dataUrl: output.dataUrl,
      inline: true,
      ext,
    }],
    pinnedVersion: 1,
  };
}

export function summarizeAgentStatus(executions = []) {
  const latest = executions[0];
  if (!latest) return 'Never run';
  if (latest.status === 'completed') return `Execution #${String(latest.executionNumber).padStart(4, '0')}`;
  return latest.status;
}

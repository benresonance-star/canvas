import { createDefaultBeatAgentState } from './beatAgentState.js';

export function beatAgentCardFromRecord(agent, position = { x: 100, y: 100 }) {
  const state = createDefaultBeatAgentState({
    ...(agent.state ?? {}),
    name: agent.name,
    status: agent.status,
  });
  return {
    id: `music-agent-${agent.id}`,
    type: 'music-agent',
    key: `music-agent__${agent.name}`,
    prefix: 'music',
    name: agent.name,
    x: position.x,
    y: position.y,
    width: 360,
    height: 260,
    pinnedVersion: 1,
    musicAgentId: agent.id,
    musicAgentType: agent.agentType,
    musicState: state,
    versions: [
      {
        version: 1,
        filename: `${agent.name}.musicartifact`,
        ext: 'musicartifact',
        inline: true,
        artifactRef: { id: agent.artifactId ?? agent.id, type: 'artifact' },
        musicAgentId: agent.id,
        musicAgentType: agent.agentType,
      },
    ],
  };
}

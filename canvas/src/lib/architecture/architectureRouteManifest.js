/**
 * Mirrors route modules mounted in server/index.js — update when adding routers.
 */
export const ARCHITECTURE_ROUTE_MANIFEST = [
  { id: 'health', module: 'routes/health.js', graphNodeId: 'apiHealth' },
  { id: 'canvasProjects', module: 'routes/canvasProjects.js', graphNodeId: 'apiCanvasProjects' },
  { id: 'canvasAgentChat', module: 'routes/canvasAgentChat.js', graphNodeId: 'apiCanvasAgentChat' },
  { id: 'spec', module: 'routes/spec.js', graphNodeId: 'apiSpec' },
  { id: 'clusters', module: 'routes/clusters.js', graphNodeId: 'apiClusters' },
  { id: 'artifacts', module: 'routes/artifacts.js', graphNodeId: 'apiArtifacts' },
  { id: 'agent', module: 'routes/agent.js', graphNodeId: 'apiAgentChat' },
  { id: 'flows', module: 'routes/flows.js', graphNodeId: 'apiFlows' },
  { id: 'liveArtifacts', module: 'routes/liveArtifacts.js', graphNodeId: 'apiLiveArtifacts' },
  { id: 'agents', module: 'routes/agents.js', graphNodeId: 'apiAgents' },
  { id: 'music', module: 'routes/music.js', graphNodeId: 'apiMusic' },
];

/**
 * Mirrors route modules mounted in server/index.js — update when adding routers.
 */
export const ARCHITECTURE_ROUTE_MANIFEST = [
  { id: 'health', module: 'routes/health.js', graphNodeId: 'apiHealth' },
  { id: 'canvasProjects', module: 'routes/canvasProjects.js', graphNodeId: 'apiCanvasProjects' },
  { id: 'diagnosticsConcentrateLayouts', module: 'routes/diagnosticsConcentrateLayouts.js', graphNodeId: 'apiDiagnosticsConcentrateLayouts' },
  { id: 'canvasPreviews', module: 'routes/canvasPreviews.js', graphNodeId: 'apiCanvasPreviews' },
  { id: 'canvasAgentChat', module: 'routes/canvasAgentChat.js', graphNodeId: 'apiCanvasAgentChat' },
  { id: 'spec', module: 'routes/spec.js', graphNodeId: 'apiSpec' },
  { id: 'clusters', module: 'routes/clusters.js', graphNodeId: 'apiClusters' },
  { id: 'artifacts', module: 'routes/artifacts.js', graphNodeId: 'apiArtifacts' },
  { id: 'primitives', module: 'routes/primitives.js', graphNodeId: 'apiPrimitives' },
  { id: 'agent', module: 'routes/agent.js', graphNodeId: 'apiAgentChat' },
  { id: 'agentTemplates', module: 'routes/agentTemplates.js', graphNodeId: 'apiAgentTemplates' },
  { id: 'flows', module: 'routes/flows.js', graphNodeId: 'apiFlows' },
  { id: 'studios', module: 'routes/studios.js', graphNodeId: 'apiStudios' },
  { id: 'liveArtifacts', module: 'routes/liveArtifacts.js', graphNodeId: 'apiLiveArtifacts' },
  { id: 'agentTypes', module: 'routes/agentTypes.js', graphNodeId: 'apiAgentTypes' },
  { id: 'agents', module: 'routes/agents.js', graphNodeId: 'apiAgents' },
  { id: 'music', module: 'routes/music.js', graphNodeId: 'apiMusic' },
  { id: 'stateMachines', module: 'routes/stateMachines.js', graphNodeId: 'apiStateMachines' },
];

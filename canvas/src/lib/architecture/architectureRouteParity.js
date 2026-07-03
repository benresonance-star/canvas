/**
 * Expected route modules mounted in server/index.js.
 * Each entry must have a matching row in architectureRouteManifest.js.
 */
export const SERVER_ROUTE_MODULES = [
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

/**
 * Maps src/features/* folders to architecture feature ids for drift audits.
 */
export const ARCHITECTURE_FEATURE_FOLDER_INVENTORY = [
  { folder: 'agents', featureId: 'agent-chat-dock' },
  { folder: 'canvas', featureId: 'revision-sync' },
  { folder: 'diagnostics', featureId: 'diagnostics-canvas' },
  { folder: 'flow', featureId: 'flow-artifacts' },
  { folder: 'live', featureId: 'previews-api' },
  { folder: 'sonicStudio', featureId: 'sonic-studio' },
  { folder: 'studio', featureId: 'nested-studios' },
  { folder: 'sync', featureId: 'revision-sync' },
  { folder: 'workspace', featureId: 'coordinator' },
];

/**
 * Postgres domains that should appear in ARCHITECTURE_ENTITY_STORAGE.
 */
export const ARCHITECTURE_ENTITY_COVERAGE_CHECKLIST = [
  { domain: 'projects', entityId: 'projects' },
  { domain: 'sync-dock', entityId: 'sync-dock' },
  { domain: 'clusters', entityId: 'clusters' },
  { domain: 'artifacts', entityId: 'artifacts' },
  { domain: 'primitives', entityId: 'primitives' },
  { domain: 'notes', entityId: 'notes' },
  { domain: 'urls', entityId: 'urls' },
  { domain: 'agent-chats', entityId: 'agent-chats' },
  { domain: 'flows', entityId: 'flows' },
  { domain: 'studios', entityId: 'studios' },
];

export function getMissingRouteManifestModules(routeManifest) {
  const covered = new Set(routeManifest.map((row) => row.module));
  return SERVER_ROUTE_MODULES.filter((row) => !covered.has(row.module));
}

export function getUnexpectedRouteManifestModules(routeManifest) {
  const expected = new Set(SERVER_ROUTE_MODULES.map((row) => row.module));
  return routeManifest.filter((row) => !expected.has(row.module));
}

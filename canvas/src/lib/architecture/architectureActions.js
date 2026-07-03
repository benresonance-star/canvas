/** @type {import('./architectureGraphSchema.js').ArchitectureActionDef[]} */
export const SYSTEM_OVERVIEW_ACTION_ID = 'system_overview';

export const ARCHITECTURE_ACTIONS = [
  {
    id: SYSTEM_OVERVIEW_ACTION_ID,
    label: 'System Overview',
    mode: 'overview',
    steps: [],
  },
  {
    id: 'add_task',
    label: 'Add task',
    steps: [
      {
        edgeIds: ['pipe-addMenu-newTaskDialog'],
        activeNodeIds: ['addMenu', 'newTaskDialog'],
        label: 'Open task dialog',
        description: 'User picks Add task from the Add menu or canvas context menu.',
        codeRef: 'src/components/AddMenu.jsx',
      },
      {
        edgeIds: ['pipe-newTaskDialog-useCanvasDocument'],
        activeNodeIds: ['newTaskDialog', 'useCanvasDocument'],
        label: 'Submit form',
        description: 'Dialog passes name, body, taskStatus, and canvas position to the document hook.',
        codeRef: 'src/features/canvas/useCanvasDocument.js',
      },
      {
        edgeIds: ['pipe-useCanvasDocument-createUserTask'],
        activeNodeIds: ['useCanvasDocument', 'createUserTask'],
        label: 'Run ingest',
        description: 'handleSaveNewTask invokes createUserTaskArtifact after folder permission check.',
        codeRef: 'src/lib/ingest/createUserTask.js',
      },
      {
        edgeIds: ['pipe-createUserTask-userFolder'],
        activeNodeIds: ['createUserTask', 'userFolder'],
        label: 'Write task file',
        description: 'Creates tasks__{name}-v1.md with YAML frontmatter on the linked folder.',
        codeRef: 'src/lib/folderWrite.js',
      },
      {
        edgeIds: ['pipe-createUserTask-artifactPlacementsMap', 'pipe-createUserTask-apiArtifacts'],
        activeNodeIds: ['createUserTask', 'artifactPlacementsMap', 'apiArtifacts'],
        label: 'Card + primitive',
        description: 'Appends canvas card with placement map entry and POSTs artifact ingest.',
        codeRef: 'src/lib/artifactPlacementsMap.js',
      },
      {
        edgeIds: ['pipe-apiArtifacts-dbArtifact'],
        activeNodeIds: ['apiArtifacts', 'dbArtifact'],
        label: 'Store primitive',
        description: 'Server upserts artifact row for graph primitives.',
        codeRef: 'server/routes/artifacts.js',
      },
      {
        edgeIds: ['pipe-useCanvasDocument-idbProjects', 'pipe-useCanvasDocument-actionSync'],
        activeNodeIds: ['useCanvasDocument', 'idbProjects', 'actionSync'],
        label: 'Cache + sync',
        description: 'Saves to IDB and requests structural sync push.',
        codeRef: 'src/lib/persistence.js',
      },
      {
        edgeIds: [
          'pipe-actionSync-commitProjectDocument',
          'pipe-commitProjectDocument-projectSyncDocument',
          'pipe-projectSyncDocument-apiCanvasProjects',
          'pipe-apiCanvasProjects-dbCanvasProjectDocument',
        ],
        activeNodeIds: ['actionSync', 'commitProjectDocument', 'projectSyncDocument', 'apiCanvasProjects', 'dbCanvasProjectDocument'],
        label: 'Push to server',
        description: 'Commit gate flushes project document with revision CAS to Postgres.',
        codeRef: 'src/lib/sync/projectSyncDocument.js',
      },
    ],
  },
  {
    id: 'add_note',
    label: 'Add note',
    steps: [
      {
        edgeIds: ['pipe-addMenu-newNoteDialog'],
        activeNodeIds: ['addMenu', 'newNoteDialog'],
        label: 'Open note dialog',
        description: 'User picks Add note from the Add menu.',
        codeRef: 'src/components/AddMenu.jsx',
      },
      {
        edgeIds: ['pipe-newNoteDialog-useCanvasDocument'],
        activeNodeIds: ['newNoteDialog', 'useCanvasDocument'],
        label: 'Submit form',
        description: 'Note fields passed to handleSaveNewNote.',
        codeRef: 'src/features/canvas/useCanvasDocument.js',
      },
      {
        edgeIds: ['pipe-useCanvasDocument-createUserNote', 'pipe-createUserNote-userFolder'],
        activeNodeIds: ['useCanvasDocument', 'createUserNote', 'userFolder'],
        label: 'Write note file',
        description: 'createUserNoteArtifact writes notes__{name}-v1.md to folder.',
        codeRef: 'src/lib/ingest/createUserNote.js',
      },
      {
        edgeIds: ['pipe-useCanvasDocument-idbProjects', 'pipe-useCanvasDocument-actionSync'],
        activeNodeIds: ['useCanvasDocument', 'idbProjects', 'actionSync'],
        label: 'Cache + sync',
        description: 'Local save and structural sync request.',
        codeRef: 'src/lib/persistence.js',
      },
      {
        edgeIds: ['pipe-commitProjectDocument-projectSyncDocument', 'pipe-apiCanvasProjects-dbCanvasProjectDocument'],
        activeNodeIds: ['projectSyncDocument', 'apiCanvasProjects', 'dbCanvasProjectDocument'],
        label: 'Server push',
        description: 'Project JSON persisted with new note card.',
        codeRef: 'src/lib/sync/projectSyncDocument.js',
      },
    ],
  },
  {
    id: 'footer_sync',
    label: 'Footer Sync',
    steps: [
      {
        edgeIds: ['pipe-canvasChrome-scanFolder', 'pipe-idbFolders-scanFolder'],
        activeNodeIds: ['canvasChrome', 'idbFolders', 'scanFolder'],
        label: 'Start scan',
        description: 'Footer Sync restores folder handle and recursively reads disk.',
        codeRef: 'src/components/CanvasChrome.jsx',
      },
      {
        edgeIds: ['pipe-scanFolder-syncStaging'],
        activeNodeIds: ['scanFolder', 'syncStaging'],
        label: 'Build diff',
        description: 'syncStaging matches disk keys to canvas and dock via syncKeysMatch.',
        codeRef: 'src/lib/syncStaging.js',
      },
      {
        edgeIds: ['pipe-syncStaging-syncConfirm'],
        activeNodeIds: ['syncStaging', 'syncConfirm'],
        label: 'Confirm (if needed)',
        description: 'New non-agent files open SYNC dialog for user approval.',
        codeRef: 'src/components/SyncConfirm.jsx',
      },
      {
        edgeIds: ['pipe-syncStaging-stageAgentChatCard', 'pipe-stageAgentChatCard-syncHoldingTray'],
        activeNodeIds: ['syncStaging', 'stageAgentChatCard', 'syncHoldingTray'],
        label: 'Auto-stage chats',
        description: 'agent_chat files stage silently to the holding dock.',
        codeRef: 'src/lib/stageAgentChatCard.js',
      },
      {
        edgeIds: ['pipe-syncStaging-artifactPlacement'],
        activeNodeIds: ['syncStaging', 'artifactPlacement'],
        label: 'Heal placement',
        description: 'Enforces canvas XOR dock exclusivity after scan apply.',
        codeRef: 'src/lib/artifactPlacement.js',
      },
    ],
  },
  {
    id: 'refresh_browser',
    label: 'Refresh browser',
    steps: [
      {
        edgeIds: ['pipe-loadProjectStructure-idbProjects'],
        activeNodeIds: ['loadProjectStructure', 'idbProjects'],
        label: 'Cache-first paint',
        description: 'Boot reads IDB for immediate project paint.',
        codeRef: 'src/lib/project/loadProjectStructure.js',
      },
      {
        edgeIds: ['pipe-loadProjectStructure-persistence'],
        activeNodeIds: ['loadProjectStructure', 'persistence'],
        label: 'Normalize load',
        description: 'Migrates card types and reconciles artifactPlacements v2.',
        codeRef: 'src/lib/persistence.js',
      },
      {
        edgeIds: ['pipe-loadProjectStructure-useProjectSyncLifecycle'],
        activeNodeIds: ['loadProjectStructure', 'useProjectSyncLifecycle'],
        label: 'Schedule reconcile',
        description: 'Background reconcile unless local edit is pending.',
        codeRef: 'src/features/sync/useProjectSyncLifecycle.js',
      },
      {
        edgeIds: ['pipe-useProjectSyncLifecycle-projectSyncDocument'],
        activeNodeIds: ['useProjectSyncLifecycle', 'projectSyncDocument'],
        label: 'Reconcile',
        description: 'reconcileActiveProject compares revisions and payloads.',
        codeRef: 'src/lib/sync/projectSyncDocument.js',
      },
      {
        edgeIds: ['pipe-projectSyncDocument-apiCanvasProjects-reconcile', 'pipe-apiCanvasProjects-dbCanvasProjectDocument'],
        activeNodeIds: ['projectSyncDocument', 'apiCanvasProjects', 'dbCanvasProjectDocument'],
        label: 'Pull or push',
        description: 'Server wins when no pending local; otherwise push local newer.',
        codeRef: 'src/lib/sync/projectSyncDocument.js',
      },
      {
        edgeIds: ['pipe-projectSyncDocument-idbProjects'],
        activeNodeIds: ['projectSyncDocument', 'idbProjects'],
        label: 'Update cache',
        description: 'IDB converges to authoritative server document.',
        codeRef: 'src/lib/persistence.js',
      },
    ],
  },
  {
    id: 'dock_to_canvas',
    label: 'Place from dock',
    steps: [
      {
        edgeIds: ['pipe-syncHoldingTray-artifactPlacement'],
        activeNodeIds: ['syncHoldingTray', 'artifactPlacement'],
        label: 'Drag to canvas',
        description: 'User drops staged card; placeStagedCardOnCanvas runs.',
        codeRef: 'src/lib/syncStaging.js',
      },
      {
        edgeIds: ['pipe-artifactPlacement-artifactPlacementsMap'],
        activeNodeIds: ['artifactPlacement', 'artifactPlacementsMap'],
        label: 'Update placement map',
        description: 'Canonical key surface changes from dock to canvas.',
        codeRef: 'src/lib/artifactPlacementsMap.js',
      },
      {
        edgeIds: ['pipe-artifactPlacement-useActionSync'],
        activeNodeIds: ['artifactPlacement', 'useActionSync'],
        label: 'Request placement sync',
        description: 'Placement transfer triggers push without SYNC dialog.',
        codeRef: 'src/features/sync/useActionSync.js',
      },
      {
        edgeIds: ['pipe-actionSync-commitProjectDocument', 'pipe-apiCanvasProjects-dbCanvasProjectDocument'],
        activeNodeIds: ['actionSync', 'commitProjectDocument', 'apiCanvasProjects', 'dbCanvasProjectDocument'],
        label: 'Persist',
        description: 'Updated placements flushed to server.',
        codeRef: 'src/lib/actionSync.js',
      },
    ],
  },
  {
    id: 'layout_commit',
    label: 'Drag card (layout commit)',
    steps: [
      {
        edgeIds: ['pipe-canvas-useActionSync'],
        activeNodeIds: ['canvas', 'useActionSync'],
        label: 'Drag end',
        description: 'Pointer-up commits card positions and canvas view.',
        codeRef: 'src/components/Canvas.jsx',
      },
      {
        edgeIds: ['pipe-actionSync-commitProjectDocument'],
        activeNodeIds: ['useActionSync', 'commitProjectDocument'],
        label: 'Commit gate',
        description: 'actionSync debounces and calls commitProjectDocument.',
        codeRef: 'src/lib/projectDocumentCommit.js',
      },
      {
        edgeIds: ['pipe-commitProjectDocument-projectSyncDocument', 'pipe-projectSyncDocument-projectSyncPatch'],
        activeNodeIds: ['commitProjectDocument', 'projectSyncDocument', 'projectSyncPatch'],
        label: 'PATCH path',
        description: 'Small layout diffs sent as patch ops when enabled.',
        codeRef: 'src/lib/sync/projectSyncPatch.js',
      },
      {
        edgeIds: ['pipe-projectSyncPatch-apiCanvasProjects', 'pipe-apiCanvasProjects-dbCanvasProjectDocument'],
        activeNodeIds: ['projectSyncPatch', 'apiCanvasProjects', 'dbCanvasProjectDocument'],
        label: 'Server update',
        description: 'Revision CAS applied to canvas_project_document.',
        codeRef: 'server/routes/canvasProjects.js',
      },
      {
        edgeIds: ['pipe-apiCanvasProjects-apiSpec', 'pipe-apiSpec-dbSpecCanvasState'],
        activeNodeIds: ['apiCanvasProjects', 'apiSpec', 'dbSpecCanvasState'],
        label: 'Spec dual-write',
        description: 'Layout/viewport mirrored to spec_canvas_state.',
        codeRef: 'src/lib/specDataPlaneSync.js',
      },
    ],
  },
  {
    id: 'agent_chat',
    label: 'Agent chat',
    steps: [
      {
        edgeIds: ['pipe-agentPanel-apiAgentChat'],
        activeNodeIds: ['agentPanel', 'apiAgentChat'],
        label: 'Send message',
        description: 'Agent panel POSTs chat request with connector id.',
        codeRef: 'server/routes/agent.js',
      },
      {
        edgeIds: ['pipe-apiAgentChat-ollama', 'pipe-apiAgentChat-openai'],
        activeNodeIds: ['apiAgentChat', 'ollama', 'openai'],
        label: 'LLM provider',
        description: 'Server routes to Ollama or OpenAI based on connector.',
        codeRef: 'server/services/agentChatProvider.js',
      },
      {
        edgeIds: ['pipe-apiAgentChat-userFolder'],
        activeNodeIds: ['apiAgentChat', 'userFolder'],
        label: 'Transcript file',
        description: 'Client writes notes__agent-chat transcript to linked folder.',
        codeRef: 'src/lib/folderWrite.js',
      },
      {
        edgeIds: ['pipe-apiAgentChat-stageAgentChatCard', 'pipe-stageAgentChatCard-syncHoldingTray'],
        activeNodeIds: ['stageAgentChatCard', 'syncHoldingTray'],
        label: 'Stage to dock',
        description: 'Agent chat card appears in sync holding tray by default.',
        codeRef: 'src/lib/stageAgentChatCard.js',
      },
      {
        edgeIds: ['pipe-apiAgentChat-apiCanvasAgentChat', 'pipe-apiCanvasAgentChat-dbAgentChat'],
        activeNodeIds: ['apiCanvasAgentChat', 'dbAgentChat'],
        label: 'Mirror session',
        description: 'Debounced PUT mirrors thread index to Postgres.',
        codeRef: 'server/routes/canvasAgentChat.js',
      },
    ],
  },
  {
    id: 'image_agent_generation',
    label: 'Image agent generation',
    steps: [
      {
        edgeIds: ['pipe-agentControlRoom-resolveAgentReferenceImages'],
        activeNodeIds: ['agentControlRoom', 'resolveAgentReferenceImages'],
        label: 'Resolve references',
        description: 'Control room loads reference image bytes from folder, cache, or artifacts.',
        codeRef: 'src/features/agents/domain/referenceImages.js',
      },
      {
        edgeIds: ['pipe-agentControlRoom-apiAgents'],
        activeNodeIds: ['agentControlRoom', 'apiAgents'],
        label: 'Run agent',
        description: 'User clicks Run; client POSTs execute with prompt, references, and settings.',
        codeRef: 'src/features/agents/api/agentsApi.js',
      },
      {
        edgeIds: ['pipe-apiAgents-agentExecutionRunner', 'pipe-agentExecutionRunner-imageTransformer'],
        activeNodeIds: ['apiAgents', 'agentExecutionRunner', 'imageTransformer'],
        label: 'Server transform',
        description: 'Execution runner records the run and invokes the image transformer.',
        codeRef: 'server/services/agentExecutionRunner.js',
      },
      {
        edgeIds: ['pipe-imageTransformer-gemini', 'pipe-imageTransformer-openaiImage'],
        activeNodeIds: ['imageTransformer', 'gemini', 'openaiImage'],
        label: 'Image provider',
        description: 'Transformer routes to Gemini or OpenAI image APIs based on agent settings.',
        codeRef: 'server/services/imageTransformer.js',
      },
      {
        edgeIds: ['pipe-agentExecutionRunner-dbAgentExecution', 'pipe-agentExecutionRunner-dbArtifact'],
        activeNodeIds: ['agentExecutionRunner', 'dbAgentExecution', 'dbArtifact'],
        label: 'Persist outputs',
        description: 'Execution row, relationships, and generated image artifacts saved in Postgres.',
        codeRef: 'server/repositories/executions.js',
      },
      {
        edgeIds: ['pipe-apiAgents-completeAgentImageGeneration'],
        activeNodeIds: ['apiAgents', 'completeAgentImageGeneration'],
        label: 'Client completion',
        description: 'Execute response returns output artifacts to the control room handler.',
        codeRef: 'src/features/agents/components/AgentControlRoom.jsx',
      },
      {
        edgeIds: [
          'pipe-completeAgentImageGeneration-userFolder',
          'pipe-completeAgentImageGeneration-useCanvasDocument',
        ],
        activeNodeIds: ['completeAgentImageGeneration', 'userFolder', 'useCanvasDocument'],
        label: 'Folder + cards',
        description: 'Generated PNGs write to generated/ folder and image cards append to canvas.',
        codeRef: 'src/features/agents/domain/completeAgentImageGeneration.js',
      },
      {
        edgeIds: ['pipe-completeAgentImageGeneration-apiPrimitives'],
        activeNodeIds: ['completeAgentImageGeneration', 'apiPrimitives'],
        label: 'Graph wires',
        description: 'created_by_agent relationships link agent artifact to each output image.',
        codeRef: 'src/features/agents/domain/wireAgentOutputImages.js',
      },
    ],
  },
  {
    id: 'create_studio',
    label: 'Create studio',
    steps: [
      {
        edgeIds: ['pipe-addMenu-createStudioDialog'],
        activeNodeIds: ['addMenu', 'createStudioDialog'],
        label: 'Open studio dialog',
        description: 'User picks Add studio from the Add menu.',
        codeRef: 'src/components/AddMenu.jsx',
      },
      {
        edgeIds: ['pipe-createStudioDialog-useCanvasDocument'],
        activeNodeIds: ['createStudioDialog', 'useCanvasDocument'],
        label: 'Submit form',
        description: 'Dialog passes title, playbook, and canvas position to handleSaveNewStudio.',
        codeRef: 'src/features/canvas/useCanvasDocument.js',
      },
      {
        edgeIds: ['pipe-useCanvasDocument-apiStudios-create'],
        activeNodeIds: ['useCanvasDocument', 'apiStudios'],
        label: 'POST /studios',
        description: 'Server creates studio artifact, primary surface, and overview payload.',
        codeRef: 'src/features/studio/api/studioApi.js',
      },
      {
        edgeIds: ['pipe-apiStudios-dbStudio'],
        activeNodeIds: ['apiStudios', 'dbStudio'],
        label: 'Persist studio',
        description: 'Inserts studio, artifact, surface, and playbook rows in Postgres.',
        codeRef: 'server/repositories/studios.js',
      },
      {
        edgeIds: ['pipe-useCanvasDocument-idbProjects', 'pipe-useCanvasDocument-actionSync'],
        activeNodeIds: ['useCanvasDocument', 'idbProjects', 'actionSync'],
        label: 'Cache + sync',
        description: 'Appends studio card locally and requests structural sync push.',
        codeRef: 'src/lib/persistence.js',
      },
      {
        edgeIds: [
          'pipe-actionSync-commitProjectDocument',
          'pipe-commitProjectDocument-projectSyncDocument',
          'pipe-projectSyncDocument-apiCanvasProjects',
          'pipe-apiCanvasProjects-dbCanvasProjectDocument',
        ],
        activeNodeIds: ['actionSync', 'commitProjectDocument', 'projectSyncDocument', 'apiCanvasProjects', 'dbCanvasProjectDocument'],
        label: 'Push to server',
        description: 'Commit gate flushes project JSON with new studio card to Postgres.',
        codeRef: 'src/lib/sync/projectSyncDocument.js',
      },
    ],
  },
  {
    id: 'create_sonic_studio',
    label: 'Create sonic studio',
    steps: [
      {
        edgeIds: ['pipe-addMenu-createSonicStudioDialog'],
        activeNodeIds: ['addMenu', 'createSonicStudioDialog'],
        label: 'Open sonic dialog',
        description: 'User picks Add Sonic Studio from the Add menu.',
        codeRef: 'src/components/AddMenu.jsx',
      },
      {
        edgeIds: ['pipe-createSonicStudioDialog-useCanvasDocument'],
        activeNodeIds: ['createSonicStudioDialog', 'useCanvasDocument'],
        label: 'Create card',
        description: 'handleSaveNewSonicStudio builds default engine state and appends sonic_studio card.',
        codeRef: 'src/features/sonicStudio/domain/sonicStudioCard.js',
      },
      {
        edgeIds: ['pipe-useCanvasDocument-idbProjects', 'pipe-useCanvasDocument-actionSync'],
        activeNodeIds: ['useCanvasDocument', 'idbProjects', 'actionSync'],
        label: 'Cache + sync',
        description: 'Saves project JSON to IDB and requests structural sync push.',
        codeRef: 'src/lib/persistence.js',
      },
      {
        edgeIds: [
          'pipe-actionSync-commitProjectDocument',
          'pipe-commitProjectDocument-projectSyncDocument',
          'pipe-projectSyncDocument-apiCanvasProjects',
          'pipe-apiCanvasProjects-dbCanvasProjectDocument',
        ],
        activeNodeIds: ['actionSync', 'commitProjectDocument', 'projectSyncDocument', 'apiCanvasProjects', 'dbCanvasProjectDocument'],
        label: 'Push to server',
        description: 'Commit gate flushes project JSON with new Sonic Studio card to Postgres.',
        codeRef: 'src/lib/sync/projectSyncDocument.js',
      },
    ],
  },
  {
    id: 'invoke_child_studio',
    label: 'Invoke child studio',
    steps: [
      {
        edgeIds: ['pipe-studioDashboard-flowEditor'],
        activeNodeIds: ['studioDashboard', 'flowEditor'],
        label: 'Open parent exploration',
        description: 'Studio dashboard opens primary Exploration surface.',
        codeRef: 'src/features/studio/components/StudioDashboard.jsx',
      },
      {
        edgeIds: ['pipe-flowEditor-apiStudios'],
        activeNodeIds: ['flowEditor', 'apiStudios'],
        label: 'Invoke child',
        description: 'Flow selection POSTs invoke-child with context packet payload.',
        codeRef: 'src/features/flow/components/FlowEditor.jsx',
      },
      {
        edgeIds: ['pipe-apiStudios-dbStudio'],
        activeNodeIds: ['apiStudios', 'dbStudio'],
        label: 'Persist child studio',
        description: 'Server creates child studio, surface, context packet, and step rows.',
        codeRef: 'server/repositories/studios.js',
      },
      {
        edgeIds: ['pipe-useCanvasDocument-apiStudios-create'],
        activeNodeIds: ['useCanvasDocument', 'apiStudios'],
        label: 'Ensure child card',
        description: 'Parent hook ensures child studio card on project canvas.',
        codeRef: 'src/features/canvas/useCanvasDocument.js',
      },
      {
        edgeIds: ['pipe-flowEditor-apiFlows', 'pipe-apiFlows-dbFlowDocument'],
        activeNodeIds: ['flowEditor', 'apiFlows', 'dbFlowDocument'],
        label: 'Project flow node',
        description: 'Client projects child studio node and flushSave persists flow_document.',
        codeRef: 'src/features/flow/domain/flowStudioProjection.js',
      },
    ],
  },
  {
    id: 'restore_child_studio',
    label: 'Restore child studio',
    steps: [
      {
        edgeIds: ['pipe-studioDashboard-apiStudios'],
        activeNodeIds: ['studioDashboard', 'apiStudios'],
        label: 'Restore request',
        description: 'Dashboard POST restore on archived child studio.',
        codeRef: 'src/features/studio/components/StudioDashboard.jsx',
      },
      {
        edgeIds: ['pipe-apiStudios-dbStudio'],
        activeNodeIds: ['apiStudios', 'dbStudio'],
        label: 'Clear archived_at',
        description: 'Server clears archive flag and appends StateTransitioned event.',
        codeRef: 'server/repositories/studios.js',
      },
      {
        edgeIds: ['pipe-apiStudios-apiFlows-restore', 'pipe-apiFlows-dbFlowDocument'],
        activeNodeIds: ['apiStudios', 'apiFlows', 'dbFlowDocument'],
        label: 'Re-insert flow node',
        description: 'Restore ensures child node exists on parent primary flow when missing.',
        codeRef: 'server/repositories/studios.js',
      },
      {
        edgeIds: ['pipe-studioDashboard-flowEditor', 'pipe-flowEditor-apiFlows'],
        activeNodeIds: ['studioDashboard', 'flowEditor', 'apiFlows'],
        label: 'Reveal on exploration',
        description: 'Opens primary surface and client re-projects or reveals restored node.',
        codeRef: 'src/features/flow/components/FlowEditor.jsx',
      },
    ],
  },
];

export function getArchitectureActionById(id) {
  return ARCHITECTURE_ACTIONS.find((a) => a.id === id) ?? null;
}

export function isOverviewAction(action) {
  return action?.mode === 'overview' || action?.id === SYSTEM_OVERVIEW_ACTION_ID;
}

/** @param {import('./architectureGraphSchema.js').ArchitectureActionDef | null | undefined} action */
export function getActionTouchedNodeIds(action) {
  const ids = new Set();
  if (!action?.steps?.length) return ids;
  for (const step of action.steps) {
    for (const nodeId of step.activeNodeIds ?? []) ids.add(nodeId);
  }
  return ids;
}

/** @param {import('./architectureGraphSchema.js').ArchitectureActionDef | null | undefined} action */
export function getActionTouchedEdgeIds(action) {
  const ids = new Set();
  if (!action?.steps?.length) return ids;
  for (const step of action.steps) {
    for (const edgeId of step.edgeIds ?? []) ids.add(edgeId);
  }
  return ids;
}

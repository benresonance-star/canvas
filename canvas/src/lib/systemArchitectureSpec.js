/** Bump when architecture or shipped load behavior changes. */
export const ARCHITECTURE_SPEC_VERSION = '2026-06-06-db-authoritative-sync';

export const ARCHITECTURE_LAYERS = [
  {
    id: 'client',
    label: 'Client',
    description:
      'React 19 + Vite — canvas, sync holding dock, `artifactPlacement`, `syncStaging` folder identity, `lib/sync/*` project sync',
    featureIds: [
      'revision-sync',
      'sync-lock',
      'local-cache',
      'coordinator',
      'artifact-placement',
      'folder-sync-identity',
      'agent-chat-dock',
      'load-target',
      'user-note-editing',
      'bookmark-editing',
    ],
  },
  {
    id: 'api',
    label: 'API',
    description:
      'Express 5 — project documents, spec canvas layout, clusters/primitives, previews, agent chat',
    featureIds: ['revision-sync', 'previews-api', 'spec-canvas-dual-write'],
  },
  {
    id: 'data',
    label: 'Data',
    description:
      'Postgres — project JSON + spec tables; IndexedDB project cache + previews; localStorage for small prefs only',
    featureIds: ['revision-sync', 'local-cache', 'previews-api', 'spec-canvas-dual-write', 'artifact-placements-map'],
  },
  {
    id: 'external',
    label: 'External',
    description: 'Browser-linked project folder (File System Access), LLM providers',
    featureIds: ['folder-ingest', 'folder-sync-identity', 'agent'],
  },
];

export const ARCHITECTURE_FEATURES = [
  {
    id: 'revision-sync',
    title: 'DB-authoritative project sync',
    shortDescription:
      'Server `canvas_project_document` is the canvas source of truth unless the browser has an explicit pending/newer local edit. IndexedDB `canvas-projects` is a cache. ' +
      'Monotonic `revision` on `canvas_project_document`. Implementation split into `lib/sync/*` (`projectSyncDocument`, `Revision`, `Index`, `Pending`, …) with `projectSync.js` barrel. Action-based sync on layout commit; create/rename/migrate/pagehide push. Project bodies in IndexedDB `canvas-projects`; slim payloads + placement refs v2; LRU eviction when quota tight.',
    layerIds: ['client', 'api', 'data'],
    tags: ['sync'],
    status: 'current',
  },
  {
    id: 'sync-lock',
    title: 'syncLock (live | offline)',
    shortDescription:
      'Canvas stays editable unless offline. Reconcile runs between user actions (not on a timer during drag). Footer Sync = folder scan.',
    layerIds: ['client'],
    tags: ['sync', 'ux'],
    status: 'current',
  },
  {
    id: 'user-note-editing',
    title: 'User note editing',
    shortDescription:
      '`user_note` cards: inline + fullscreen edit always enabled in UI (`computeUserNoteDisabled` is false). Saves to linked folder when key is in scan set; otherwise project JSON only (`saveUserNoteToProject`). Legacy `notes__*` markdown rows migrate to `user_note` on load.',
    layerIds: ['client', 'external'],
    tags: ['notes', 'ux'],
    status: 'current',
  },
  {
    id: 'bookmark-editing',
    title: 'Bookmark / link editing',
    shortDescription:
      'Bookmark cards (`links__*` keys): inline URL + title on canvas and in `CardModal` via `BookmarkInlineEditor` / `saveBookmarkToProject` — project JSON only, no folder file.',
    layerIds: ['client'],
    tags: ['links', 'ux'],
    status: 'current',
  },
  {
    id: 'artifact-placement',
    title: 'Artifact placement (canvas XOR dock)',
    shortDescription:
      'Each folder-backed artifact has one surface per project: `cards` (canvas) or `stagedSyncCards` (sync holding dock), never both. Enforced by `artifactPlacement.js` on load, save, dock/canvas moves, and folder scan.',
    layerIds: ['client'],
    tags: ['placement', 'sync'],
    status: 'current',
  },
  {
    id: 'artifact-placements-map',
    title: 'artifactPlacements map (persisted)',
    shortDescription:
      'Project JSON includes `artifactPlacements` (canonical sync key → surface + record). Built on save; legacy projects migrate on load. Denormalized `cards` / `stagedSyncCards` kept for compatibility.',
    layerIds: ['client', 'data'],
    tags: ['placement', 'storage'],
    status: 'current',
  },
  {
    id: 'agent-chat-dock',
    title: 'Agent chat → sync dock',
    shortDescription:
      'New transcripts stage to the holding dock (not auto-spawned on canvas). Folder scan auto-stages `agent_chat` files silently; thread index + staged discovery keep chats addressable before place-on-canvas.',
    layerIds: ['client', 'external'],
    tags: ['agent', 'sync'],
    status: 'current',
  },
  {
    id: 'spec-canvas-dual-write',
    title: 'Spec canvas dual-write',
    shortDescription:
      'On save, layout/viewport mirrored to `spec_canvas_state` (CAS). On load, drift vs project JSON is logged; **project document remains authoritative** until full spec cutover.',
    layerIds: ['api', 'data'],
    tags: ['spec', 'sync'],
    status: 'current',
  },
  {
    id: 'local-cache',
    title: 'Local-first cache',
    shortDescription:
      'IndexedDB project documents + workspace index; preview blobs and folder handles in separate IDB stores; cache-first paint then server reconcile.',
    layerIds: ['client', 'data'],
    tags: ['storage'],
    status: 'current',
  },
  {
    id: 'coordinator',
    title: 'runExclusive coordinator',
    shortDescription: 'Single-flight boot, poll, switch, and refresh to avoid sync races.',
    layerIds: ['client'],
    tags: ['sync'],
    status: 'current',
  },
  {
    id: 'folder-ingest',
    title: 'Browser folder ingest',
    shortDescription:
      'Server index stores `connectedFolderName`; IndexedDB (`canvas-folders`) holds the directory handle. `scanFolder` groups files by canonical `fullBase` key; optional primitives ingest.',
    layerIds: ['external', 'client'],
    tags: ['files'],
    status: 'current',
  },
  {
    id: 'folder-sync-identity',
    title: 'Folder sync identity (SYNC dialog)',
    shortDescription:
      'SYNC confirm is for **new or updated files on disk**, not dock↔canvas moves. `syncStaging.js` matches folder keys to canvas + dock via `syncKeysMatch`, filename, and prefix+name; `buildConfirmChangesForDialog` re-runs against live refs after async scan. `migrateFolderBackedCardKeys` on load; tray drag / placement invalidates stale scans.',
    layerIds: ['client', 'external'],
    tags: ['sync', 'files'],
    status: 'current',
  },
  {
    id: 'previews-api',
    title: 'Preview blobs',
    shortDescription:
      'Per card-version `previewCacheKey`; IndexedDB local + optional `canvas_preview_blob` on server.',
    layerIds: ['data', 'api'],
    tags: ['media'],
    status: 'current',
  },
  {
    id: 'clusters-agent',
    title: 'Clusters, graph & agent',
    shortDescription:
      'Primitives graph (artifacts, notes, relationships) per cluster; agent sessions + thread index mirrored to server when API is up.',
    layerIds: ['api', 'client', 'external'],
    tags: ['features'],
    status: 'current',
  },
  {
    id: 'load-target',
    title: 'DB-convergent cache-first load',
    shortDescription:
      'Switch/boot: paint from local cache quickly, then converge to the server document when there is no pending local edit; preview hydration remains background work.',
    layerIds: ['client'],
    tags: ['performance'],
    status: 'current',
  },
];

/**
 * Where each product entity is persisted (authoritative vs cache).
 * @type {{ id: string, label: string, summary: string, server: string, client: string }[]}
 */
export const ARCHITECTURE_ENTITY_STORAGE = [
  {
    id: 'projects',
    label: 'Projects & placement',
    summary:
      'Workspace list + per-project canvas document: `cards`, `stagedSyncCards`, `artifactPlacements`, `canvasView`, `suppressedSyncKeys`. Placement is one surface per canonical sync key (canvas XOR dock).',
    server:
      '`canvas_workspace_index` · `canvas_project_document` (revision CAS, authoritative UX JSON) · `spec_canvas_state` (layout/viewport dual-write)',
    client:
      'IndexedDB `canvas-projects` (+ legacy `localStorage` migration) · `artifactPlacement.js` · `artifactPlacements` map on load/save · `lib/sync/*` reconcile/push',
  },
  {
    id: 'sync-dock',
    label: 'Sync holding dock',
    summary:
      'Unplaced folder discoveries and new agent chats live in `stagedSyncCards` until dragged onto the canvas. Not a second source of truth — reconciled with `artifactPlacements` / exclusivity rules.',
    server:
      'Staged rows are inside the project document payload (not a separate table)',
    client:
      '`stagedSyncCards` in project JSON · `SyncHoldingTray` drag-to-place · `moveToDock` / `moveToCanvas` (`artifactPlacement`) — placement alone must not open SYNC confirm (`syncStaging`)',
  },
  {
    id: 'clusters',
    label: 'Clusters',
    summary:
      'Graph workspace per project: root cluster, sub-clusters, membership. Not embedded in project JSON.',
    server:
      '`cluster` · `project_cluster` · `cluster_member`',
    client:
      'Fetched via API while project is open; held in React session state',
  },
  {
    id: 'artifacts',
    label: 'Artifacts (primitives)',
    summary:
      'Ingested files and structured sources (hash-deduped in `artifact`). Linked into clusters; card `versions[].artifactRef` points at primitive rows.',
    server:
      '`artifact` · `spec_resource` + `spec_project_resource` (spec migration, dual-write path)',
    client:
      'Refs on card versions; preview bytes in IndexedDB `canvas-previews` and optional server blobs',
  },
  {
    id: 'primitives',
    label: 'Primitives (graph)',
    summary:
      'Unified graph: artifacts, notes, relationships, events. Connectors use `relationship` (spec `note_links` table exists for future cutover).',
    server:
      '`artifact` · `note` · `relationship` · `canvas_event` — `/clusters/:id/primitives`, `/relationships`',
    client:
      'Loaded from API per open project; no durable local primitive store',
  },
  {
    id: 'notes',
    label: 'Notes',
    summary:
      'Folder files `notes__*.md` → `user_note` cards. Inline + fullscreen edit via `saveUserNote` (renames all versions). Graph `note` rows are separate primitive attachments.',
    server:
      'Graph: `note` (+ `spec_note` / `spec_note_link` for spec path)',
    client:
      '`user_note` in project JSON · `resolveLoadedCardType` on load · `saveUserNote` (folder) or `saveUserNoteToProject` (JSON-only)',
  },
  {
    id: 'urls',
    label: 'URLs & bookmarks',
    summary: 'Bookmark cards on canvas; ingested links may set `artifact.uri`.',
    server: 'Card data in project JSON; optional `spec_url_link` (spec path)',
    client:
      'Bookmark `versions[].url` in project JSON · inline edit via `projectCardEdits.saveBookmarkToProject` (canvas + modal)',
  },
  {
    id: 'agent-chats',
    label: 'Agent chats',
    summary:
      'Per-connector threads; transcripts as `notes__agent-chat-…` files in the linked folder. Default UI location is the **dock** until the user places on canvas (`thread.cardId`).',
    server:
      '`canvas_agent_chat_session` · `canvas_agent_chat_thread_index` · `spec_chat` (spec path)',
    client:
      'localStorage session + thread index; debounced server mirror · dock staging via `stageAgentChatCard`',
  },
];

const CORE_API_ROUTES = [
  'GET /health',
  'GET|PUT /canvas/index',
  'GET /canvas/projects/:id/meta',
  'GET /canvas/projects/:id/layout (target: layout-only payload for fast cross-browser convergence)',
  'GET|PUT /canvas/projects/:id (revision, expectedRevision → 409)',
  'GET|PUT /canvas/projects/:id/spec-canvas (layout/viewport CAS)',
  'GET /spec/resources/:id (reference count)',
  'POST /canvas/projects/:id/spec-resources/:rid/detach',
  'GET|POST|DELETE /spec/notes/:noteId/links',
  'GET|PUT /canvas/previews/:cacheKey',
  'POST /clusters, GET /clusters/by-project/:id',
  'POST /agent/chat',
  'GET|PUT /canvas/agent-chat/...',
];

const LOAD_ROADMAP = [
  { id: 'A', label: 'IDB singleton, cache-first switch, early overlay, gate refreshGraph' },
  { id: 'B', label: 'Progressive / localOnly-first preview hydration' },
  { id: 'C', label: 'Background sync diet; mirror active project only' },
  { id: 'D', label: 'Dev perf marks (boot/switch/hydrate)' },
];

export const IMPLEMENTATION_PRIORITIES = [
  {
    id: 1,
    title: 'Server-side project/index integrity',
    summary:
      'The API must not return index rows for projects whose `canvas_project_document` row is missing. Missing-document ghosts should be pruned or repaired server-side before browsers can treat them as selectable projects.',
  },
  {
    id: 2,
    title: 'DB authority unless local edit pending',
    summary:
      'On boot, refresh, project switch, and cross-browser sync, the DB project document wins when the browser has no explicit pending/newer local mutation. IndexedDB is a paint cache, not a competing authority.',
  },
  {
    id: 3,
    title: 'Layout/meta-only loading surface',
    summary:
      'Add a lightweight read path for revision, counts, cards, staged cards, placements, viewport, and sync status without shipping preview/content-heavy project JSON for every convergence check.',
  },
  {
    id: 4,
    title: 'Per-project operation queues',
    summary:
      'Replace broad global sync blocking with scoped lanes so folder scans, index writes, project layout writes, graph refresh, preview hydration, and placement changes do not unnecessarily block each other.',
  },
  {
    id: 5,
    title: 'Sync test stabilization',
    summary:
      'Split oversized sync tests into focused invariants, especially stale-cache cross-browser cases, index/document consistency, pending-local edit conflicts, and layout-only convergence.',
  },
  {
    id: 6,
    title: 'Spec canvas authority clarified',
    summary:
      '`spec_canvas_state` remains a secondary diagnostic/projection table until explicit cutover. Drift is logged or repaired from project JSON; spec rows must not decide the rendered canvas.',
  },
];

const SPEC_MIGRATION_NOTE =
  'North star: `Specs/Canvas data architecture Spec -Claude.md`. Current decision: `canvas_project_document` is the rendered-canvas authority; `spec_canvas_state` is a secondary projection until explicit cutover. Shipped: placement SSOT, `artifactPlacements`, folder sync identity (`syncStaging`), agent dock sync, `lib/sync/*` project sync modules, `spec_*` tables + dual-write. Not yet: relational project index, layout-only read path, shared resource store on disk, UUID-only identity, `note_links`-only connectors UI.';

export function buildArchitectureMermaid() {
  return `flowchart TB
  subgraph client [Client_React_Vite]
    UI[Canvas_and_SyncTray]
    Place[artifactPlacement]
    Stage[syncStaging]
    SyncMod[lib_sync_projectSync]
    Sync[reconcileActiveProject]
    LS[localStorage_prefs]
    IDB[IDB_projects_previews_folders]
  end
  subgraph api [Express_API]
    Routes[REST_routes]
  end
  subgraph data [Postgres]
    Doc[canvas_project_document]
    Spec[spec_canvas_state]
    Graph[clusters_artifacts]
    Blobs[canvas_preview_blob]
    Agent[agent_chat_tables]
  end
  subgraph external [External]
    Folder[User_project_folder]
    LLM[Agent_providers]
  end
  UI --> Place
  UI --> Stage
  Stage --> Place
  Place --> IDB
  UI --> SyncMod
  SyncMod --> Sync
  Sync --> Routes
  Routes --> Doc
  Routes --> Spec
  SyncMod --> IDB
  UI --> IDB
  Routes --> Graph
  Routes --> Blobs
  Routes --> Agent
  UI --> Folder
  UI --> LLM`;
}

/**
 * @param {object} [runtime]
 * @param {string} [runtime.generatedAt]
 * @param {string} [runtime.syncMode]
 * @param {boolean} [runtime.serverSyncEnabled]
 * @param {string|null} [runtime.activeProjectId]
 * @param {string} [runtime.syncLock]
 * @param {number} [runtime.clientRevision]
 * @param {number} [runtime.cardCount]
 * @param {number} [runtime.stagedCount]
 * @param {boolean} [runtime.folderLinked]
 * @param {string} [runtime.folderLinkPhase]
 */
export function buildArchitectureMarkdown(runtime) {
  const lines = [
    `# Canvas — system architecture (spec ${ARCHITECTURE_SPEC_VERSION})`,
    '',
    '## Stack',
    '- **Client:** React 19 + Vite — infinite canvas, sync holding dock, version stacks, agent chat',
    '- **API:** Express 5 — REST JSON (projects, spec canvas, clusters/primitives, previews, agent)',
    '- **Database:** Postgres — `canvas_project_document`, `spec_canvas_state`, graph primitives, preview blobs, agent chat',
    '- **Local:** IndexedDB `canvas-projects` (project bodies), `canvas-previews`, `canvas-folders`; localStorage for workspace index + small prefs',
    '',
    '## Code layout (client sync)',
    '- **`lib/sync/*`:** `projectSyncState`, `Revision`, `Merge`, `Local`, `Index`, `Document`, `Pending`, `Init` — barrel export `projectSync.js`',
    '- **`syncStaging.js`:** folder scan diff (`buildSyncChangesFromFolder`), SYNC confirm list (`buildConfirmChangesForDialog`), staged tray helpers',
    '- **`artifactPlacement.js`:** canvas XOR dock exclusivity (`moveToCanvas`, `moveToDock`, `enforceExclusivePlacement`)',
    '- **`actionSync.js`:** action-based flush/reconcile (layout commit, structural change, folder scan, boot)',
    '',
    '## Placement model (current)',
    '- Each folder-backed artifact is keyed by a **canonical sync key** (`toCanonicalSyncKey` / filename `fullBase`).',
    '- **Exactly one surface per key:** canvas (`cards`) **or** dock (`stagedSyncCards`), never both.',
    '- **`artifactPlacement.js`** is the runtime authority for moves and healing duplicates.',
    '- **`artifactPlacements`** in saved JSON records surface + card/staged payload (migrated on load if missing).',
    '- **`migrateFolderBackedCardKeys`** rewrites legacy `-v1` card keys from version filenames on load.',
    '- **Agent chats** default to the dock; canvas only when `thread.cardId` points at a live card or user drags from tray.',
    '',
    '## Sync model (current)',
    '- Server **project document JSON** (`canvas_project_document`) is the rendered-canvas authority unless the browser has an explicit pending/newer local edit',
    '- IndexedDB `canvas-projects` is a cache used for fast paint; after server metadata/document arrives, it must converge to the DB truth',
    '- **`reconcileActiveProject`:** revision match → live; equivalent payloads → adopt revision only; local newer/pending → `pushProjectDocumentIfLocalNewer`; server wins → auto-pull + toast',
    '- **Action sync:** pointer-up layout/view commit, structural changes, placement transfer, project switch, folder scan, visibility resume',
    '- **PATCH sync (when `VITE_CANVAS_PATCH_SYNC` enabled):** small `projectPatchOps` per event; `PATCH /canvas/projects/:id`; SSE `project_updated` to other tabs; full `PUT` fallback on conflict or large diffs',
    '- Legacy debounced `saveSyncedProjectDocument` path unused in app; pushes use `flushOutgoingProjectDocument` (PATCH or PUT, CAS `expectedRevision` → 409)',
    '- **`seedClientRevisionFromMeta`** after cache-first load prevents idle false-stale',
    '- Canvas editable unless **offline**; no mandatory Refresh banner (`shouldShowRefreshFromServer` disabled)',
    '- Footer **Sync** = pull (if server on) + folder scan/reconnect; revision heal is automatic',
    '- **Folder scan (`scanFolder`):** groups disk files; `agent_chat` auto-stages to dock; other **new disk files** open SYNC confirm',
    '- **SYNC dialog is not for placement:** dock→canvas drag re-validates against live `stateRef` + `stagedSyncCardsRef`; stale in-flight scans are cancelled',
    '- `runExclusive` serializes boot, poll, switch, refresh, and storage-tab updates',
    '',
    '## User notes (current)',
    '- Card type **`user_note`** (`notes | NOTE`) — not legacy `markdown` for `notes__` files (migrated on load)',
    '- **Canvas:** title + `UserNoteInlineEditor` when active (zoom ≥ 0.5); editing always enabled in UI',
    '- **Fullscreen:** editable title in `CardModal`; body via `UserNoteEditor`',
    '- **Folder:** `saveUserNote` when folder linked and key in scan set; else `saveUserNoteToProject`',
    '- Missing from folder scan still shown via red ring (`isCardMissingFromFolder`)',
    '',
    '## Bookmarks (current)',
    '- **`bookmark`** cards (`links__*`): URL + title editable on canvas and in modal (`BookmarkInlineEditor`, `saveBookmarkToProject`)',
    '- Not folder-backed; persisted in project JSON only',
    '',
    '## Spec data plane (partial)',
    `- ${SPEC_MIGRATION_NOTE}`,
    '- Dual-write: save also `PUT`s layout/viewport to `spec_canvas_state` (version CAS)',
    '- Load: compare spec row to JSON; **project JSON wins** if they differ until an explicit spec cutover is implemented',
    '',
    '## Data stores (summary)',
    '- **Workspace index:** `canvas/index` — project list, `activeProjectId`, connected folder names',
    '- **Project document:** cards, stagedSyncCards, artifactPlacements, canvasView (~48MB soft limit)',
    '- **Previews:** `previewCacheKey` → IndexedDB; optional `canvas_preview_blob`',
    '- **Folder handles:** `canvas-folders` IndexedDB per projectId',
    '- **Integrity:** `auditWorkspaceIndex` — orphan recovery, ghost index rows',
    '',
    '## Entity storage',
    ...ARCHITECTURE_ENTITY_STORAGE.flatMap((e) => [
      `### ${e.label}`,
      e.summary,
      `- **Server:** ${e.server}`,
      `- **Client:** ${e.client}`,
      '',
    ]),
    '## Core API routes',
    ...CORE_API_ROUTES.map((r) => `- ${r}`),
    '',
    '## Key features',
    ...ARCHITECTURE_FEATURES.map(
      (f) =>
        `- **${f.title}** (${f.status}): ${f.shortDescription}`,
    ),
    '',
    '## Load performance roadmap',
    ...LOAD_ROADMAP.map((item) => `- Phase ${item.id}: ${item.label}`),
    '',
    '## Current implementation priorities',
    ...IMPLEMENTATION_PRIORITIES.map((item) => `- ${item.id}. **${item.title}:** ${item.summary}`),
    '',
  ];

  if (runtime) {
    lines.push('## Runtime snapshot (when copied)');
    lines.push(`- generatedAt: ${runtime.generatedAt ?? 'n/a'}`);
    lines.push(`- syncMode: ${runtime.syncMode ?? 'n/a'}`);
    lines.push(`- serverSyncEnabled: ${runtime.serverSyncEnabled ?? 'n/a'}`);
    lines.push(`- activeProjectId: ${runtime.activeProjectId ?? 'none'}`);
    lines.push(`- syncLock: ${runtime.syncLock ?? 'n/a'}`);
    lines.push(`- clientRevision: ${runtime.clientRevision ?? 0}`);
    lines.push(`- cardCount: ${runtime.cardCount ?? 0}`);
    if (runtime.stagedCount != null) {
      lines.push(`- stagedCount: ${runtime.stagedCount}`);
    }
    lines.push(`- folderLinked: ${runtime.folderLinked ?? false}`);
    if (runtime.folderLinkPhase) {
      lines.push(`- folderLinkPhase: ${runtime.folderLinkPhase}`);
    }
    lines.push('');
  }

  lines.push('## Mermaid');
  lines.push('```mermaid');
  lines.push(buildArchitectureMermaid());
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

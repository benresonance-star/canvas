# Canvas Music Framework Repo Integration Notes

## Current Repository Shape

Canvas is a Vite React app rooted at `canvas/`. The existing codebase is mostly
plain JavaScript and JSX, with Vitest configured for `*.test.js`. Server code is
Express, Postgres, and SQL migrations under `server/migrations`.

The music framework should therefore start as additive JavaScript modules with
JSDoc-style boundaries and Zod/runtime validation where useful. A TypeScript
conversion can be a later hardening step, but it should not block the MVP.

## Integration Points

- App shell and workspace UI: `src/features/workspace/CanvasWorkspaceView.jsx`
- Canvas card shell: `src/components/CanvasCard.jsx`
- Card previews: `src/components/CardPreview.jsx`
- Fullscreen/modal content: `src/components/CardModal.jsx` and `src/components/ModalContent.jsx`
- Card type helpers: `src/lib/filename.js`
- Linked folder writes: `src/lib/folderWrite.js`
- Project document API: `src/lib/canvasProjectsApi.js`
- Server route registration: `server/index.js`
- Server migrations: `server/migrations`
- Server route/repository precedent: `server/routes/flows.js` and `server/repositories/flows.js`

## Planned File Layout

Shared pure music logic:

```text
packages/music-core/
  src/
    index.js
    transport/
    timing/
    patterns/
    validation/
    serialization/
```

Canvas runtime music feature:

```text
src/features/music/
  api/
  agents/beat/
  components/
  kernel/
  transport/
  ui/
```

Server music data layer:

```text
server/migrations/0017_music_framework.sql
server/repositories/music.js
server/routes/music.js
```

## Artifact Strategy

The first card type is `music-agent`, with `musicAgentType: "beat"` for the MVP.
This follows the Flow/Live pattern: the canvas card is a project document entry,
while durable runtime state lives in dedicated Postgres tables and the generic
`artifact` primitive table links it into the graph.

Cards should carry:

- `type: "music-agent"`
- `musicAgentId`
- `musicAgentType: "beat"`
- `versions[0].artifactRef`
- `versions[0].musicAgentId`

## Data Strategy

Postgres is the active runtime state. The linked project folder is the portability
surface. The live playback clock must remain in memory and must not write on
transport ticks.

Initial tables:

- `music_transport`
- `music_agent`
- `music_pattern`
- `music_preset`
- `music_version`
- `music_import_export`
- `music_blackboard`

## Phase 1 Paths

- `packages/music-core/src/transport/transportState.js`
- `packages/music-core/src/timing/timing.js`
- `packages/music-core/src/patterns/beatPattern.js`
- `packages/music-core/src/validation/musicValidation.js`
- `packages/music-core/src/serialization/musicArtifactManifest.js`
- `packages/music-core/src/index.js`

## Phase 2 Paths

- `src/features/music/kernel/MusicKernel.js`
- `src/features/music/kernel/MusicKernelProvider.jsx`
- `src/features/music/kernel/eventBus/MusicEventBus.js`
- `src/features/music/kernel/registry/AgentRegistry.js`
- `src/features/music/kernel/registry/PluginRegistry.js`
- `src/features/music/kernel/audio/AudioEngine.js`

## Risk Notes

- Existing project sync invariants should not be bypassed. Creating a music card
  should still use the workspace `handleSaveNew...` flow and project document
  commit path.
- Existing folder-backed card logic excludes rich artifact types. `music-agent`
  should also be excluded from ordinary folder-backed note/file sync.
- AI edits must produce validated structured patches only. They must not run in
  the audio path.
- WebAudio work must be initiated only from user gestures to avoid browser audio
  context blocking.

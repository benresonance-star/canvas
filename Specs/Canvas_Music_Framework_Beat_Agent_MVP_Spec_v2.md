# Canvas Music Framework + Beat Agent MVP Specification v2.0

**Target repo:** Canvas desktop/web app  
**Primary stack assumed:** React, TypeScript, Postgres, Docker Desktop, local/cloud LLM providers, project folder storage  
**First concrete implementation:** Beat Agent  
**Long-term direction:** Modular music agents, effects, mixer, master, arrangement, and Pocket Player interoperability

---

## 0. Executive Summary

This specification defines a modular music subsystem for Canvas.

The MVP is **Beat Agent**, a deterministic step-sequencer and sample-based drum instrument with an agentic editing layer. The architecture must not be limited to drums. The first implementation establishes a reusable **Music Kernel** that future agents can share:

- Beat Agent
- Bass Agent
- Pad Agent
- Melody Agent
- Chord Agent
- Sampler Agent
- Looper Agent
- FX Agent
- Mixer Agent
- Master Agent
- Arrangement Agent
- Pocket Player import/export bridge

The key architectural rule is:

> **The AI edits structured musical state. The deterministic engine produces sound.**

AI must never be inside the real-time audio path.

---

## 1. Product Goals

### 1.1 MVP Goals

Build a Beat Agent artifact inside Canvas that can:

1. Be created, read, updated, duplicated, soft-deleted, and restored.
2. Sync to a project-level Music Transport.
3. Play deterministic drum patterns.
4. Store all state in Postgres.
5. Save portable files into the project folder.
6. Export/import `.musicartifact` packages.
7. Generate and mutate patterns using an AI layer that outputs validated JSON.
8. Save presets, versions, and variations.
9. Use a professional compact music-device UI style.
10. Provide a framework for other agents and effects.

### 1.2 Non-Goals for MVP

Do not implement these in the MVP unless trivial once architecture exists:

- Full DAW timeline
- Audio recording
- Multitrack waveform editing
- Complex arrangement view
- VST/AU plugin hosting
- Ableton Link implementation
- MIDI hardware sync
- Cloud collaboration
- Mobile Pocket Player app

The MVP should prepare extension points for these, but not block on them.

---

## 2. Core Philosophy

Canvas music artifacts are not traditional plugins.

They are **living project artifacts**:

- deterministic engine
- editable UI
- saved state
- project folder representation
- version history
- agentic assistant
- portable package
- inspectable metadata
- connectable node in Canvas

A music artifact should be able to leave one Canvas project, enter another, rebuild itself from file state, and reattach to the new project clock.

---

## 3. Architectural Overview

```text
Canvas Project
│
├── Project Folder
│   └── music/
│       └── beat-agent-01/
│
├── Postgres
│   ├── current state
│   ├── metadata
│   ├── versions
│   ├── presets
│   └── import/export records
│
├── Music Kernel
│   ├── Transport
│   ├── Scheduler
│   ├── Audio Engine Interface
│   ├── Event Bus
│   ├── Musical Blackboard
│   ├── Plugin Registry
│   ├── Agent Registry
│   ├── Serialization
│   └── CRUD services
│
└── Music Agents
    └── Beat Agent MVP
```

---

## 4. Shared `music-core` Package

The music kernel should be built around a reusable `music-core` package that can later be used by both Canvas and Pocket Player.

### 4.1 Shared Concepts

```text
packages/music-core
│
├── transport
├── scheduler
├── timing
├── quantization
├── musical-events
├── patterns
├── midi
├── scales
├── presets
├── validation
└── serialization
```

### 4.2 Canvas vs Pocket Player

```text
Canvas Music Framework
- project brain
- artifact storage
- Postgres
- visual UI
- agents
- portable project folders
- multi-agent collaboration

Pocket Player
- immediate capture
- voice-to-MIDI
- low-latency performance
- mobile gesture UI
- local sketching
- later sync/import into Canvas
```

Shared formats must allow:

- Beat pattern from Canvas → Pocket Player
- Voice-generated rhythm from Pocket Player → Canvas Beat Agent
- Preset from Canvas → Pocket Player
- MIDI-like event package between both

---

## 5. Proposed Repository Structure

Adapt paths to match the existing repo, but keep the modular boundaries.

```text
canvas-repo/
│
├── apps/
│   └── canvas/
│       └── src/
│           ├── music/
│           │   ├── kernel/
│           │   │   ├── MusicKernel.ts
│           │   │   ├── MusicKernelProvider.tsx
│           │   │   ├── index.ts
│           │   │   │
│           │   │   ├── transport/
│           │   │   │   ├── Transport.ts
│           │   │   │   ├── TransportProvider.tsx
│           │   │   │   ├── transportTypes.ts
│           │   │   │   ├── useTransport.ts
│           │   │   │   └── transport.test.ts
│           │   │   │
│           │   │   ├── scheduler/
│           │   │   │   ├── Scheduler.ts
│           │   │   │   ├── SchedulerWorker.ts
│           │   │   │   ├── schedulerTypes.ts
│           │   │   │   └── scheduler.test.ts
│           │   │   │
│           │   │   ├── eventBus/
│           │   │   │   ├── MusicEventBus.ts
│           │   │   │   ├── eventTypes.ts
│           │   │   │   └── eventBus.test.ts
│           │   │   │
│           │   │   ├── audio/
│           │   │   │   ├── AudioEngine.ts
│           │   │   │   ├── WebAudioEngine.ts
│           │   │   │   ├── audioTypes.ts
│           │   │   │   └── audioEngine.test.ts
│           │   │   │
│           │   │   ├── blackboard/
│           │   │   │   ├── MusicalBlackboard.ts
│           │   │   │   ├── blackboardTypes.ts
│           │   │   │   └── blackboard.test.ts
│           │   │   │
│           │   │   ├── registry/
│           │   │   │   ├── AgentRegistry.ts
│           │   │   │   ├── PluginRegistry.ts
│           │   │   │   ├── registryTypes.ts
│           │   │   │   └── registry.test.ts
│           │   │   │
│           │   │   ├── serialization/
│           │   │   │   ├── serializeMusicArtifact.ts
│           │   │   │   ├── deserializeMusicArtifact.ts
│           │   │   │   ├── musicArtifactManifest.ts
│           │   │   │   └── serialization.test.ts
│           │   │   │
│           │   │   └── services/
│           │   │       ├── musicApiClient.ts
│           │   │       ├── musicFileService.ts
│           │   │       └── musicCrudService.ts
│           │   │
│           │   ├── agents/
│           │   │   └── beat/
│           │   │       ├── BeatAgentPlugin.ts
│           │   │       ├── BeatAgentArtifact.tsx
│           │   │       ├── BeatAgentInspector.tsx
│           │   │       ├── BeatAgentFullscreen.tsx
│           │   │       ├── BeatAgentNode.tsx
│           │   │       │
│           │   │       ├── components/
│           │   │       │   ├── BeatDeviceFrame.tsx
│           │   │       │   ├── BeatPatternGrid.tsx
│           │   │       │   ├── BeatTrackRow.tsx
│           │   │       │   ├── BeatTrackControls.tsx
│           │   │       │   ├── BeatSampleSlot.tsx
│           │   │       │   ├── BeatVariationPanel.tsx
│           │   │       │   ├── BeatAgentPromptPanel.tsx
│           │   │       │   └── BeatTransportStrip.tsx
│           │   │       │
│           │   │       ├── engine/
│           │   │       │   ├── BeatEngine.ts
│           │   │       │   ├── BeatSchedulerAdapter.ts
│           │   │       │   ├── SampleVoice.ts
│           │   │       │   ├── PatternPlayer.ts
│           │   │       │   └── beatEngine.test.ts
│           │   │       │
│           │   │       ├── schemas/
│           │   │       │   ├── beatAgent.schema.ts
│           │   │       │   ├── beatPattern.schema.ts
│           │   │       │   ├── beatPreset.schema.ts
│           │   │       │   ├── beatVariation.schema.ts
│           │   │       │   └── beatValidation.test.ts
│           │   │       │
│           │   │       ├── hooks/
│           │   │       │   ├── useBeatAgent.ts
│           │   │       │   ├── useBeatPlayback.ts
│           │   │       │   ├── useBeatPattern.ts
│           │   │       │   └── useBeatAgentAI.ts
│           │   │       │
│           │   │       ├── prompts/
│           │   │       │   ├── beatAgent.system.md
│           │   │       │   ├── beatAgent.modifyPattern.md
│           │   │       │   └── beatAgent.generateVariation.md
│           │   │       │
│           │   │       └── index.ts
│           │   │
│           │   ├── effects/
│           │   │   └── README.md
│           │   │
│           │   ├── ui/
│           │   │   ├── device/
│           │   │   │   ├── DeviceFrame.tsx
│           │   │   │   ├── DeviceHeader.tsx
│           │   │   │   ├── DeviceSection.tsx
│           │   │   │   └── DeviceFooter.tsx
│           │   │   │
│           │   │   ├── controls/
│           │   │   │   ├── Knob.tsx
│           │   │   │   ├── Toggle.tsx
│           │   │   │   ├── StepButton.tsx
│           │   │   │   ├── NumericReadout.tsx
│           │   │   │   ├── MiniMeter.tsx
│           │   │   │   ├── MiniEnvelope.tsx
│           │   │   │   └── ParameterLock.tsx
│           │   │   │
│           │   │   └── tokens/
│           │   │       ├── musicTokens.ts
│           │   │       └── musicTheme.css
│           │   │
│           │   └── types/
│           │       ├── musicAgentTypes.ts
│           │       ├── musicArtifactTypes.ts
│           │       └── musicProjectTypes.ts
│           │
│           └── existing-canvas-modules/
│
├── packages/
│   └── music-core/
│       ├── src/
│       │   ├── transport/
│       │   ├── scheduler/
│       │   ├── timing/
│       │   ├── quantization/
│       │   ├── patterns/
│       │   ├── midi/
│       │   ├── scales/
│       │   ├── presets/
│       │   ├── validation/
│       │   ├── serialization/
│       │   └── index.ts
│       └── package.json
│
├── server/
│   └── music/
│       ├── routes/
│       │   ├── musicAgents.routes.ts
│       │   ├── musicClocks.routes.ts
│       │   ├── musicPatterns.routes.ts
│       │   ├── musicPresets.routes.ts
│       │   ├── musicVersions.routes.ts
│       │   └── musicArtifacts.routes.ts
│       │
│       ├── services/
│       │   ├── MusicAgentService.ts
│       │   ├── MusicClockService.ts
│       │   ├── MusicPatternService.ts
│       │   ├── MusicPresetService.ts
│       │   ├── MusicVersionService.ts
│       │   ├── MusicArtifactFileService.ts
│       │   └── MusicImportExportService.ts
│       │
│       ├── repositories/
│       │   ├── MusicAgentRepository.ts
│       │   ├── MusicClockRepository.ts
│       │   ├── MusicPatternRepository.ts
│       │   ├── MusicPresetRepository.ts
│       │   └── MusicVersionRepository.ts
│       │
│       ├── migrations/
│       │   └── 0001_music_framework.sql
│       │
│       └── tests/
│           ├── musicAgents.integration.test.ts
│           ├── musicImportExport.integration.test.ts
│           └── musicCrud.integration.test.ts
│
└── docs/
    └── music/
        ├── Canvas_Music_Framework_Spec_v2.md
        ├── beat-agent-json-examples.md
        └── music-artifact-package-format.md
```

---

## 6. Music Kernel

### 6.1 Kernel Responsibilities

The Music Kernel owns:

- AudioContext lifecycle
- Universal Transport
- Scheduler
- Event Bus
- Agent Registry
- Plugin Registry
- Musical Blackboard
- Audio Engine Interface
- Serialization
- Import/export orchestration
- Project clock subscriptions
- Global musical context
- Shared services between agents

### 6.2 Kernel Non-Responsibilities

The kernel should not:

- Contain Beat-specific logic
- Contain Bass-specific logic
- Contain UI styling
- Know individual agent internals
- Directly call LLMs
- Persist directly to Postgres without service abstraction
- Use Postgres as a real-time clock

---

## 7. Universal Transport

### 7.1 Why Transport Instead of Clock

Use the term **Transport** for the full music timing object.

A clock gives pulses. A transport gives musical state.

### 7.2 Transport State

```ts
export type ClockSource = 'internal' | 'project' | 'midi' | 'ableton-link' | 'external';

export interface MusicTransportState {
  id: string;
  projectId: string;
  isPlaying: boolean;
  isPaused: boolean;
  isRecording: boolean;
  bpm: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  swing: number;
  currentBar: number;
  currentBeat: number;
  currentTick: number;
  ticksPerQuarter: number;
  loopEnabled: boolean;
  loopStartBar: number;
  loopEndBar: number;
  clockSource: ClockSource;
  globalKey?: string;
  globalScale?: string;
  updatedAt: string;
}
```

### 7.3 Transport Events

```ts
export type TransportEvent =
  | { type: 'TRANSPORT_STARTED'; atAudioTime: number }
  | { type: 'TRANSPORT_STOPPED'; atAudioTime: number }
  | { type: 'TRANSPORT_PAUSED'; atAudioTime: number }
  | { type: 'TRANSPORT_POSITION_CHANGED'; bar: number; beat: number; tick: number }
  | { type: 'BPM_CHANGED'; bpm: number }
  | { type: 'TIME_SIGNATURE_CHANGED'; numerator: number; denominator: number }
  | { type: 'SWING_CHANGED'; swing: number }
  | { type: 'LOOP_CHANGED'; enabled: boolean; startBar: number; endBar: number }
  | { type: 'GLOBAL_KEY_CHANGED'; key: string; scale: string };
```

### 7.4 Persistence Rule

Transport state is persisted to Postgres as project state, but real-time playback timing runs in the browser/audio runtime.

Do not query Postgres to determine the current beat during playback.

---

## 8. Scheduler

### 8.1 Scheduler Requirements

The scheduler must:

- Schedule ahead of time using AudioContext time.
- Avoid UI thread jitter where possible.
- Support step grids.
- Support swing.
- Support microtiming.
- Support probability.
- Support loop boundaries.
- Support deterministic random seeds.

### 8.2 Scheduler Interface

```ts
export interface MusicScheduler {
  start(): void;
  stop(): void;
  pause(): void;
  setBpm(bpm: number): void;
  setSwing(swing: number): void;
  setLoop(loop: MusicLoopState): void;
  subscribe(listener: ScheduledTickListener): () => void;
  getPosition(): MusicalPosition;
}
```

### 8.3 Timing Targets

- UI responsiveness: 60 FPS.
- Transport visual drift: acceptable if visual only.
- Audio event jitter target: below 2 ms where possible.
- Scheduling lookahead: configurable, default 100 ms.
- Scheduler tick interval: configurable, default 25 ms.

---

## 9. Event Bus

### 9.1 Event Bus Purpose

The Event Bus decouples transport, UI, agents, persistence, and audio engines.

### 9.2 Event Types

```ts
export type MusicEvent =
  | TransportEvent
  | AgentEvent
  | PatternEvent
  | PresetEvent
  | VersionEvent
  | AudioEvent
  | ImportExportEvent
  | BlackboardEvent;
```

### 9.3 Common Events

```ts
export type AgentEvent =
  | { type: 'AGENT_CREATED'; agentId: string; agentType: string }
  | { type: 'AGENT_UPDATED'; agentId: string }
  | { type: 'AGENT_DELETED'; agentId: string }
  | { type: 'AGENT_DUPLICATED'; sourceAgentId: string; newAgentId: string }
  | { type: 'AGENT_STATUS_CHANGED'; agentId: string; status: MusicAgentStatus }
  | { type: 'AGENT_VARIATION_GENERATED'; agentId: string; variationId: string }
  | { type: 'AGENT_ERROR'; agentId: string; message: string };
```

---

## 10. Audio Engine Interface

### 10.1 Rationale

Do not bind the system to a single audio implementation.

Tone.js may be useful for MVP, but it should sit behind an adapter. Future implementations may use:

- Web Audio API directly
- AudioWorklets
- Tone.js
- Faust compiled to WebAssembly
- RNBO
- WebAudio Modules
- Native bridge
- Pocket Player mobile engine

### 10.2 Interface

```ts
export interface AudioEngine {
  initialize(context?: AudioContext): Promise<void>;
  loadState(state: unknown): Promise<void>;
  setParameter(path: string, value: unknown): void;
  trigger(event: MusicTriggerEvent): void;
  start(position?: MusicalPosition): void;
  stop(): void;
  renderOffline(options: OfflineRenderOptions): Promise<AudioRenderResult>;
  dispose(): void;
}
```

### 10.3 Rule

Only the deterministic audio engine may produce sound.

The AI layer may produce:

- JSON patches
- pattern proposals
- preset proposals
- explanations
- labels
- tags

The AI layer may not directly emit audio events during playback.

---

## 11. Musical Blackboard

### 11.1 Purpose

The Musical Blackboard is shared project intelligence. Agents read and write to it without tight coupling.

### 11.2 Blackboard State

```ts
export interface MusicalBlackboardState {
  projectId: string;
  tempo: number;
  key?: string;
  scale?: string;
  section?: 'intro' | 'verse' | 'chorus' | 'bridge' | 'drop' | 'breakdown' | 'outro' | 'unknown';
  energy?: number;
  density?: number;
  tension?: number;
  brightness?: number;
  swing?: number;
  grooveDescription?: string;
  currentChord?: string;
  bassOccupancy?: FrequencyOccupancy;
  kickOccupancy?: FrequencyOccupancy;
  spectralBalance?: SpectralBalance;
  referenceDescriptors?: string[];
  humanNotes?: string[];
  updatedAt: string;
}
```

### 11.3 MVP Usage

For MVP, implement as a simple in-memory + persisted JSON state.

Beat Agent writes:

- density
- groove description
- kick occupancy estimate
- swing
- pattern length
- current style tags

Future Bass Agent can read kick occupancy and avoid conflict.

---

## 12. Plugin Registry

### 12.1 Purpose

Future agents and effects must register themselves without modifying kernel internals.

### 12.2 Agent Plugin Interface

```ts
export interface MusicAgentPlugin<TState = unknown> {
  type: string;
  displayName: string;
  version: string;
  defaultState: () => TState;
  validateState: (state: unknown) => TState;
  createEngine: (state: TState, kernel: MusicKernel) => AudioEngine;
  renderNode: React.ComponentType<MusicAgentRenderProps<TState>>;
  renderInspector: React.ComponentType<MusicAgentRenderProps<TState>>;
  renderFullscreen: React.ComponentType<MusicAgentRenderProps<TState>>;
  serialize: (state: TState) => SerializedMusicAgent;
  deserialize: (serialized: SerializedMusicAgent) => TState;
}
```

### 12.3 Future Effect Plugin Interface

```ts
export interface MusicEffectPlugin<TState = unknown> {
  type: string;
  displayName: string;
  version: string;
  defaultState: () => TState;
  validateState: (state: unknown) => TState;
  createProcessor: (state: TState, kernel: MusicKernel) => AudioEffectProcessor;
  renderControls: React.ComponentType<MusicEffectRenderProps<TState>>;
}
```

---

## 13. Beat Agent MVP

### 13.1 Beat Agent Purpose

Beat Agent is the first music artifact.

It is:

- a step sequencer
- sample player
- groove editor
- variation generator
- agentic rhythm collaborator
- portable project artifact

### 13.2 Beat Agent Controls

Minimum MVP controls:

- BPM sync mode
- pattern length
- steps per bar
- swing amount
- global density
- global humanize
- track mute
- track solo
- track volume
- track pan
- track sample
- step on/off
- step velocity
- step probability
- step microtiming
- preset select
- generate variation
- parameter locks

### 13.3 Default Tracks

MVP tracks:

1. Kick
2. Snare
3. Clap
4. Closed Hat
5. Open Hat
6. Perc 1
7. Perc 2
8. Texture / FX

### 13.4 Beat Pattern Schema

```ts
export interface BeatPattern {
  id: string;
  name: string;
  bars: number;
  stepsPerBar: number;
  tracks: BeatTrack[];
  seed: number;
  createdAt: string;
  updatedAt: string;
}

export interface BeatTrack {
  id: string;
  name: string;
  role: 'kick' | 'snare' | 'clap' | 'closed_hat' | 'open_hat' | 'perc' | 'texture' | 'fx';
  sampleId?: string;
  mute: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  steps: BeatStep[];
}

export interface BeatStep {
  index: number;
  enabled: boolean;
  velocity: number;
  probability: number;
  microtimingMs: number;
  retrigger?: number;
  parameterLocks?: Record<string, unknown>;
}
```

### 13.5 Example Pattern JSON

```json
{
  "id": "pattern_default",
  "name": "Default Four",
  "bars": 1,
  "stepsPerBar": 16,
  "seed": 101,
  "tracks": [
    {
      "id": "kick",
      "name": "Kick",
      "role": "kick",
      "sampleId": "sample_kick_default",
      "mute": false,
      "solo": false,
      "volume": 0.9,
      "pan": 0,
      "steps": [
        { "index": 0, "enabled": true, "velocity": 1, "probability": 1, "microtimingMs": 0 },
        { "index": 1, "enabled": false, "velocity": 0, "probability": 0, "microtimingMs": 0 }
      ]
    }
  ]
}
```

### 13.6 Beat Agent State

```ts
export interface BeatAgentState {
  id: string;
  projectId: string;
  artifactId: string;
  clockId?: string;
  name: string;
  syncMode: 'project' | 'internal' | 'external';
  internalTransport?: Partial<MusicTransportState>;
  pattern: BeatPattern;
  sampleBank: BeatSampleBank;
  parameters: BeatAgentParameters;
  locks: ParameterLockState;
  uiState: BeatAgentUiState;
  agentState: BeatAgentAssistantState;
  version: number;
}
```

### 13.7 Parameter Locking

Each important parameter must be lockable.

```ts
export interface ParameterLockState {
  lockedPaths: string[];
}
```

Example locked paths:

```text
pattern.tracks.kick.steps
parameters.swing
sampleBank.kick
parameters.globalDensity
```

AI edits must not modify locked paths.

---

## 14. Beat Agent AI Layer

### 14.1 Purpose

The Beat Agent AI helps users generate, mutate, explain, and refine rhythm patterns.

### 14.2 Agent Actions

MVP actions:

- Generate new beat
- Generate similar beat
- Generate wild variation
- Make simpler
- Make more complex
- Add ghost notes
- Add microbeats
- Make more organic
- Make more rigid
- Humanize
- Reduce clutter
- Increase tension
- Explain current beat

### 14.3 Agent Output Contract

AI must output structured JSON patches only.

```ts
export interface BeatAgentPatch {
  summary: string;
  confidence: number;
  reasoningForUser: string;
  patches: JsonPatchOperation[];
  suggestedTags?: string[];
}
```

### 14.4 Validation Pipeline

```text
User prompt
↓
LLM proposal
↓
JSON parse
↓
Schema validation
↓
Locked path check
↓
Musical sanity check
↓
Preview diff
↓
User accepts or applies automatically depending on setting
↓
Persist state
↓
Save version snapshot
```

### 14.5 AI Safety Rules

- No direct audio generation.
- No real-time playback mutation unless user enables live mode later.
- No changing locked parameters.
- No deleting samples.
- No destructive changes without version snapshot.
- No external file access except through approved project services.

---

## 15. UI Specification

### 15.1 Visual Direction

The UI should be inspired by compact professional electronic music devices and Max-for-Live-style devices:

- dark charcoal base
- grey modular panels
- clear rectangular regions
- compact rotary controls
- large numeric readouts
- small meters
- pattern grid
- colour-coded parameter groups
- no skeuomorphic chrome
- high information density without clutter

Do not copy any specific proprietary interface directly.

### 15.2 Beat Agent Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ Beat Agent 01       Project Sync ●     120 BPM    4/4       │
├───────────────┬─────────────────────────────┬───────────────┤
│ Tracks        │ Pattern Grid                 │ Agent Panel   │
│ Kick          │ 1 e & a 2 e & a ...          │ Prompt        │
│ Snare         │                             │ Suggestions   │
│ Clap          │ x . . . x . . .             │ Explanation   │
│ Hat           │ . x . x . x . x             │ Apply/Reject  │
│ Perc          │                             │               │
├───────────────┴─────────────────────────────┴───────────────┤
│ Swing  Density  Humanize  Velocity  Probability  Microtime   │
├─────────────────────────────────────────────────────────────┤
│ Variations: Original | A | B | C | Wild | Similar | Mutate    │
└─────────────────────────────────────────────────────────────┘
```

### 15.3 Component Responsibilities

#### DeviceFrame

- Consistent outer visual container.
- Header, content, footer slots.

#### BeatPatternGrid

- Displays tracks and steps.
- Supports click to toggle.
- Supports modifier/edit mode for velocity, probability, microtiming.
- Keyboard accessible where practical.

#### BeatAgentPromptPanel

- Text prompt input.
- Apply button.
- Generate variation controls.
- Diff preview.

#### BeatVariationPanel

- Variation tree.
- Restore.
- Duplicate.
- Compare.

#### BeatTransportStrip

- Sync indicator.
- Project/internal transport selection.
- Play/stop for preview.

### 15.4 UI State

UI state must be persisted separately from engine state.

Examples:

- panel collapsed
- selected track
- selected step
- grid zoom
- inspector open
- prompt panel width
- active variation

---

## 16. CRUD and Postgres

### 16.1 Design Rule

Postgres stores current state, metadata, versions, presets, and import/export records.

Project folder stores portable artifact files.

Real-time audio state should be in memory.

### 16.2 SQL Migration

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS music_clocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Project Transport',
  bpm NUMERIC(7, 3) NOT NULL DEFAULT 120,
  time_signature_num INT NOT NULL DEFAULT 4,
  time_signature_den INT NOT NULL DEFAULT 4,
  swing NUMERIC(6, 3) NOT NULL DEFAULT 0,
  ticks_per_quarter INT NOT NULL DEFAULT 960,
  loop_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  loop_start_bar INT NOT NULL DEFAULT 1,
  loop_end_bar INT NOT NULL DEFAULT 9,
  global_key TEXT,
  global_scale TEXT,
  clock_source TEXT NOT NULL DEFAULT 'internal',
  persisted_state JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS music_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  artifact_id UUID,
  clock_id UUID REFERENCES music_clocks(id),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sync_mode TEXT NOT NULL DEFAULT 'project',
  status TEXT NOT NULL DEFAULT 'draft',
  tags TEXT[] NOT NULL DEFAULT '{}',
  color TEXT,
  instructions TEXT,
  engine_state JSONB NOT NULL DEFAULT '{}',
  agent_state JSONB NOT NULL DEFAULT '{}',
  ui_state JSONB NOT NULL DEFAULT '{}',
  file_path TEXT,
  current_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS music_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES music_agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pattern_type TEXT NOT NULL DEFAULT 'beat',
  bars INT NOT NULL DEFAULT 1,
  steps_per_bar INT NOT NULL DEFAULT 16,
  seed BIGINT NOT NULL DEFAULT 1,
  pattern JSONB NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS music_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  agent_id UUID REFERENCES music_agents(id) ON DELETE SET NULL,
  agent_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  preset JSONB NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS music_agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES music_agents(id) ON DELETE CASCADE,
  version_num INT NOT NULL,
  label TEXT,
  parent_version_id UUID REFERENCES music_agent_versions(id),
  reason TEXT,
  snapshot JSONB NOT NULL,
  file_path TEXT,
  created_by TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS music_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  duration_ms INT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS music_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  agent_id UUID REFERENCES music_agents(id) ON DELETE SET NULL,
  export_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  manifest JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS music_blackboard (
  project_id UUID PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_music_agents_project_id ON music_agents(project_id);
CREATE INDEX IF NOT EXISTS idx_music_agents_type ON music_agents(type);
CREATE INDEX IF NOT EXISTS idx_music_agents_deleted_at ON music_agents(deleted_at);
CREATE INDEX IF NOT EXISTS idx_music_patterns_agent_id ON music_patterns(agent_id);
CREATE INDEX IF NOT EXISTS idx_music_versions_agent_id ON music_agent_versions(agent_id);
CREATE INDEX IF NOT EXISTS idx_music_presets_agent_type ON music_presets(agent_type);
CREATE INDEX IF NOT EXISTS idx_music_samples_project_id ON music_samples(project_id);
```

### 16.3 CRUD Endpoints

```text
POST   /api/music/clocks
GET    /api/music/clocks/:clockId
PATCH  /api/music/clocks/:clockId
DELETE /api/music/clocks/:clockId

POST   /api/music/agents
GET    /api/music/agents/:agentId
GET    /api/music/projects/:projectId/agents
PATCH  /api/music/agents/:agentId
DELETE /api/music/agents/:agentId
POST   /api/music/agents/:agentId/duplicate
POST   /api/music/agents/:agentId/restore

POST   /api/music/agents/:agentId/patterns
GET    /api/music/agents/:agentId/patterns
PATCH  /api/music/patterns/:patternId
DELETE /api/music/patterns/:patternId

POST   /api/music/agents/:agentId/versions
GET    /api/music/agents/:agentId/versions
POST   /api/music/agents/:agentId/restore-version/:versionId

POST   /api/music/presets
GET    /api/music/presets/:presetId
GET    /api/music/projects/:projectId/presets
PATCH  /api/music/presets/:presetId
DELETE /api/music/presets/:presetId

POST   /api/music/agents/:agentId/export
POST   /api/music/projects/:projectId/import
```

### 16.4 Soft Delete

Delete should default to soft delete:

```sql
deleted_at = now()
```

Hard delete only in explicit dev/admin maintenance operations.

---

## 17. Project Folder and Portability

### 17.1 Project Folder Structure

Each music agent saves to the project folder.

```text
project-folder/
└── music/
    ├── _project/
    │   ├── transport.json
    │   ├── blackboard.json
    │   └── manifest.json
    │
    └── beat-agent-01/
        ├── manifest.json
        ├── beat.agent.json
        ├── current.pattern.json
        ├── presets/
        │   └── default.preset.json
        ├── versions/
        │   └── 0001.initial.json
        ├── samples/
        ├── midi/
        ├── audio/
        └── exports/
```

### 17.2 Portable Package

```text
beat-agent-01.musicartifact/
├── manifest.json
├── agent.json
├── patterns/
│   └── current.pattern.json
├── presets/
├── versions/
├── samples/
├── midi/
└── audio/
```

### 17.3 Manifest

```json
{
  "format": "canvas.musicartifact",
  "formatVersion": "1.0.0",
  "artifactType": "music-agent",
  "agentType": "beat",
  "agentVersion": "1.0.0",
  "createdAt": "2026-06-25T00:00:00.000Z",
  "sourceProjectId": "uuid",
  "sourceAgentId": "uuid",
  "files": [
    {
      "path": "agent.json",
      "kind": "agent-state",
      "sha256": "..."
    }
  ],
  "dependencies": {
    "samples": [],
    "presets": []
  }
}
```

### 17.4 Import Rule

On import:

1. Read manifest.
2. Validate format and version.
3. Copy files into destination project folder.
4. Create new Postgres agent row.
5. Create related patterns, presets, versions.
6. Relink sample paths.
7. Attach to destination project transport by default.
8. Preserve source metadata in import record.
9. Never overwrite existing files without conflict resolution.

### 17.5 Portability Rule

The project folder is the source of portability.

Postgres is the source of active runtime state.

A music agent must be recoverable from its `.musicartifact` folder.

---

## 18. Versioning and Variations

### 18.1 Version Types

- Manual save
- Auto-save
- AI variation
- Import snapshot
- Restore snapshot
- Duplicate snapshot

### 18.2 Variation Tree

Support parent/child versions.

```text
Original
├── Variation A
├── Variation B
│   ├── B1
│   └── B2
└── Variation C
```

### 18.3 Snapshot Contents

A version snapshot should include:

- agent metadata
- engine state
- pattern
- sample references
- parameters
- locks
- tags
- AI explanation if generated by agent
- blackboard contribution summary

---

## 19. Presets

### 19.1 Preset Scope

Presets may be:

- project presets
- agent presets
- global/user presets later

MVP can implement project presets only.

### 19.2 Preset Contents

```ts
export interface MusicPreset {
  id: string;
  projectId: string;
  agentType: string;
  name: string;
  description?: string;
  tags: string[];
  preset: unknown;
  isFavorite: boolean;
}
```

### 19.3 MVP Preset Actions

- Save preset
- Load preset
- Duplicate preset
- Rename preset
- Favorite preset
- Delete preset

---

## 20. Effects Layer Future-Proofing

### 20.1 MVP Requirement

Do not build a full effects system yet, but create the interfaces and folder structure.

### 20.2 Future Effect Chain

```text
Beat Engine
↓
Insert FX
↓
Send FX
↓
Mixer
↓
Master
```

### 20.3 Effect State Interface

```ts
export interface MusicEffectState {
  id: string;
  type: string;
  enabled: boolean;
  parameters: Record<string, unknown>;
  uiState?: Record<string, unknown>;
}
```

### 20.4 First Future Effects

- Filter
- Saturation
- Compressor
- Delay
- Reverb
- Bit crush
- Transient shaper
- EQ

---

## 21. Canvas Integration

### 21.1 Artifact Type

Register a new artifact family:

```text
music-agent
```

First subtype:

```text
music-agent/beat
```

### 21.2 Canvas Node

A Beat Agent node should show:

- name
- play/stop indicator
- sync status
- small pattern preview
- status
- current preset
- variation count

### 21.3 Double Click Behaviour

Double-click opens fullscreen Beat Agent.

Fullscreen exposes:

- transport
- pattern grid
- samples
- presets
- AI prompt panel
- variation history
- inspector
- export/import controls

### 21.4 Universal Inspector

Every music artifact should expose:

- name
- type
- description
- tags
- color
- sync mode
- transport
- current preset
- version
- file path
- created at
- updated at
- status

---

## 22. Agent Status

Use a consistent status model:

```ts
export type MusicAgentStatus =
  | 'draft'
  | 'ready'
  | 'playing'
  | 'generating'
  | 'rendering'
  | 'error'
  | 'offline'
  | 'deleted';
```

Status should appear in UI and be persisted.

---

## 23. Sample Library

### 23.1 MVP

Use a minimal local sample set.

Options:

1. bundle simple generated samples
2. include user-provided samples
3. create placeholder WebAudio synthesized drum hits

The MVP should not depend on paid samples.

### 23.2 Sample References

Beat Agent should reference samples by ID/path, not embed sample binaries in JSON.

```ts
export interface BeatSample {
  id: string;
  name: string;
  role: string;
  filePath: string;
  durationMs?: number;
  gain?: number;
  trimStartMs?: number;
  trimEndMs?: number;
}
```

---

## 24. Testing Strategy

### 24.1 Unit Tests

Test:

- transport math
- bar/beat/tick conversion
- scheduler timing calculations
- pattern validation
- JSON patch validation
- parameter lock enforcement
- serialization
- import/export manifest parsing

### 24.2 Integration Tests

Test:

- create Beat Agent
- update pattern
- save version
- restore version
- export `.musicartifact`
- import into different project
- CRUD soft delete and restore
- blackboard update
- project transport save/load

### 24.3 UI Tests

Test:

- Beat Agent renders
- step toggles update state
- pattern grid changes persist
- prompt panel handles JSON patch preview
- variation restore changes pattern
- sync mode toggle works

### 24.4 Manual Audio Tests

Manual tests are acceptable for MVP audio playback.

Checklist:

- play starts
- stop stops
- BPM change works
- loop works
- swing audibly changes hats
- velocity changes volume
- probability changes event occurrence
- microtiming shifts step
- UI does not freeze during playback

---

## 25. Build Phases

Each phase must compile and be testable before moving on.

### Phase 0 — Repo Discovery and Integration Plan

**Goal:** Understand existing Canvas repo structure and choose exact integration points.

Tasks:

- Inspect existing artifact system.
- Inspect existing project model.
- Inspect existing Postgres access layer.
- Inspect current file/project folder services.
- Identify routing pattern.
- Identify state management pattern.
- Create implementation notes before coding.

Acceptance:

- Add `docs/music/repo-integration-notes.md`.
- No major code changes yet.

---

### Phase 1 — `music-core` Package

**Goal:** Create reusable foundation.

Tasks:

- Add `packages/music-core`.
- Add transport types.
- Add timing utilities.
- Add pattern types.
- Add validation helpers.
- Add serialization interfaces.

Acceptance:

- Package builds.
- Unit tests pass.
- No dependency on React.
- No dependency on Canvas.

---

### Phase 2 — Music Kernel Skeleton

**Goal:** Add Canvas runtime kernel.

Tasks:

- Add MusicKernel.
- Add EventBus.
- Add PluginRegistry.
- Add AgentRegistry.
- Add MusicKernelProvider.
- Add placeholder AudioEngine interface.

Acceptance:

- Kernel initializes in Canvas.
- No Beat Agent yet.
- Event bus test passes.
- Registry test passes.

---

### Phase 3 — Universal Transport MVP

**Goal:** Add project transport.

Tasks:

- Create transport state.
- Add play/stop.
- Add BPM.
- Add time signature.
- Add loop state.
- Add simple scheduler.
- Add transport UI strip.

Acceptance:

- Transport UI works.
- Demo scheduled callback fires on beats.
- Persist transport settings to local runtime state.
- No Postgres yet required unless easy.

---

### Phase 4 — Postgres Schema and CRUD

**Goal:** Add database backing.

Tasks:

- Add migration.
- Add repositories.
- Add services.
- Add routes.
- Add API client.
- Add create/read/update/delete for music clocks and agents.

Acceptance:

- Migration runs.
- Create clock works.
- Create music agent row works.
- Soft delete works.
- Tests pass.

---

### Phase 5 — Beat Agent Data Model

**Goal:** Add Beat Agent schemas without sound yet.

Tasks:

- Add BeatAgentState.
- Add BeatPattern.
- Add BeatTrack.
- Add BeatStep.
- Add validation.
- Add default pattern.

Acceptance:

- Valid default Beat Agent can be created.
- Invalid pattern rejected.
- State persists to Postgres.
- File snapshot saved to project folder.

---

### Phase 6 — Beat Agent UI MVP

**Goal:** Build visual artifact.

Tasks:

- Add Beat Agent plugin.
- Add Canvas node.
- Add fullscreen UI.
- Add pattern grid.
- Add track controls.
- Add transport sync selector.
- Add inspector.

Acceptance:

- User can create Beat Agent.
- User can toggle steps.
- User can edit velocity/probability/microtiming.
- User can rename agent.
- State persists.

---

### Phase 7 — Beat Playback Engine

**Goal:** Make Beat Agent audible.

Tasks:

- Implement BeatEngine.
- Implement sample voice.
- Connect to Music Transport.
- Implement scheduled step playback.
- Implement velocity.
- Implement probability.
- Implement microtiming.
- Implement swing.

Acceptance:

- Beat plays in sync with transport.
- Stop works reliably.
- BPM changes apply.
- Pattern edits affect playback.
- No obvious UI freezing.

---

### Phase 8 — Presets and Versions

**Goal:** Make exploration safe.

Tasks:

- Add preset CRUD.
- Add version snapshots.
- Add restore version.
- Add duplicate.
- Add variation tree UI.

Acceptance:

- Save preset works.
- Load preset works.
- Auto-version before destructive change.
- Restore previous version works.

---

### Phase 9 — Portable `.musicartifact` Export/Import

**Goal:** Make artifacts portable between projects.

Tasks:

- Add manifest format.
- Export Beat Agent package.
- Import Beat Agent package.
- Relink files.
- Recreate DB rows.
- Handle name conflicts.

Acceptance:

- Export package produced.
- Import into another project works.
- Imported agent plays.
- Imported agent attaches to new project transport.

---

### Phase 10 — Beat Agent AI Layer

**Goal:** Add agentic editing.

Tasks:

- Add system prompt.
- Add JSON patch output schema.
- Add parameter lock enforcement.
- Add prompt panel.
- Add diff preview.
- Add apply/reject.
- Add generate similar/wild/mutate.

Acceptance:

- AI can generate valid pattern changes.
- Invalid output rejected.
- Locked paths protected.
- Version snapshot saved before AI edit.
- User can see summary and apply/reject.

---

### Phase 11 — Musical Blackboard MVP

**Goal:** Prepare agent collaboration.

Tasks:

- Add blackboard table/service.
- Add in-memory blackboard state.
- Beat Agent writes density/groove/kick occupancy.
- UI inspector shows blackboard contribution.

Acceptance:

- Blackboard persists.
- Beat Agent updates blackboard.
- Future agents can read blackboard through service.

---

### Phase 12 — Effects Extension Skeleton

**Goal:** Prepare effects layer.

Tasks:

- Add effect plugin interface.
- Add effect chain type.
- Add disabled placeholder UI section.
- Add docs for first effects.

Acceptance:

- Interfaces compile.
- No actual effects required.
- Future effect can register without changing kernel.

---

## 26. Coding Conventions

### 26.1 General

- TypeScript strict mode where feasible.
- Small files.
- Explicit interfaces.
- Prefer pure functions in `music-core`.
- Keep React out of `music-core`.
- Keep Beat-specific logic out of kernel.
- Keep database access out of React components.
- Keep AI prompts out of audio engine.
- Keep real-time playback out of Postgres.

### 26.2 Dependency Direction

Allowed:

```text
Beat Agent → Music Kernel → music-core
Beat Agent → shared UI controls
Server services → repositories
React hooks → API client
```

Not allowed:

```text
music-core → Canvas
Music Kernel → Beat Agent internals
Audio Engine → AI layer
React components → direct DB
Postgres → live transport clock
```

---

## 27. Error Handling

### 27.1 User-Facing Errors

Show clear errors for:

- invalid pattern
- sample missing
- import failed
- audio context blocked by browser
- AI output invalid
- locked parameter attempted change
- database save failed
- project folder write failed

### 27.2 Recovery

On critical state error:

1. Stop playback.
2. Preserve current unsaved state if possible.
3. Load last valid version.
4. Show recovery action.

---

## 28. Security and Safety

- Validate all imported `.musicartifact` files.
- Do not execute code from imported packages.
- Treat imported JSON as untrusted.
- Limit file paths to project folder.
- Prevent path traversal.
- Do not allow agent prompt to request arbitrary filesystem access.
- Check sample file types.
- Keep LLM output behind schema validation.

---

## 29. Performance Guidance

### 29.1 UI

- Avoid rerendering whole grid on every transport tick.
- Use memoized rows/steps.
- Separate playback position animation from persisted state.
- Do not write to Postgres every tick.
- Debounce parameter persistence.

### 29.2 Audio

- Schedule ahead.
- Avoid allocating objects in critical playback loops.
- Decode samples once.
- Reuse buffers.
- Stop all voices on transport stop.
- Dispose engines when artifact closes or project unloads.

---

## 30. Codex Implementation Rules

Codex should:

1. Inspect the repo before assuming paths.
2. Implement in phases.
3. Run tests after each phase.
4. Commit or checkpoint each phase if the workflow supports it.
5. Avoid broad rewrites.
6. Prefer additive modular files.
7. Keep existing Canvas behavior unchanged.
8. Add feature flags if integration is risky.
9. Write TODOs only where future phases explicitly require them.
10. Stop and report if existing architecture conflicts with this spec.

### 30.1 Verification Checklist Per Phase

After each phase:

```text
- Typecheck passes
- Unit tests pass
- App starts
- Existing artifacts still work
- No console errors from unrelated systems
- New code follows dependency direction
- Docs updated where relevant
```

---

## 31. MVP Acceptance Criteria

The MVP is complete when:

1. User can create a Beat Agent artifact.
2. User can open it in fullscreen.
3. User can edit a step pattern.
4. User can play/stop it using project transport.
5. User can switch between project sync and internal timing.
6. User can save/load pattern state.
7. User can save presets.
8. User can restore previous versions.
9. User can export `.musicartifact`.
10. User can import that package into another project.
11. User can ask the Beat Agent to generate or mutate a pattern.
12. AI output is validated before applying.
13. Locked parameters are protected.
14. Output files save to the project folder.
15. Future agents can be registered via plugin interface.

---

## 32. Future Roadmap

### 32.1 Bass Agent

- Mono synth
- Glide
- Sub oscillator
- filter envelope
- kick-aware frequency avoidance
- MIDI export

### 32.2 Pad Agent

- Chord voicing
- long envelope
- detune
- shimmer/reverb
- movement
- scale-aware generation

### 32.3 Melody Agent

- motif generation
- variation
- call/response
- scale constraints

### 32.4 FX Layer

- modular insert chain
- send/return
- effect presets
- effect automation later

### 32.5 Mixer Agent

- levels
- panning
- group buses
- rough mix suggestions

### 32.6 Master Agent

- limiter
- compressor
- EQ
- loudness target
- export preview

### 32.7 Arrangement Agent

- sections
- transitions
- energy curve
- song form
- mute/unmute automation

### 32.8 Pocket Player Bridge

- import Pocket Player sketches
- export Canvas patterns to Pocket Player
- shared music-core
- voice-generated MIDI mapped to agents

---

## 33. First Codex Task Prompt

Use this prompt to start implementation:

```text
You are working in the Canvas repo.

Implement the Canvas Music Framework in phases according to docs/music/Canvas_Music_Framework_Spec_v2.md.

Start with Phase 0 only.

Do not implement Beat Agent yet.

Tasks:
1. Inspect the repo structure.
2. Identify existing artifact registration patterns.
3. Identify existing project folder/file services.
4. Identify existing Postgres migration and API route conventions.
5. Identify frontend state management conventions.
6. Create docs/music/repo-integration-notes.md describing the exact integration plan.
7. Propose the precise file paths for Phase 1 and Phase 2.
8. Do not modify runtime app behavior yet.

Acceptance:
- Existing app remains unchanged.
- A clear integration note exists.
- The plan maps this spec onto the actual repo structure.
```

---

## 34. Second Codex Task Prompt

Use after Phase 0 is complete:

```text
Implement Phase 1 and Phase 2 of the Canvas Music Framework.

Use docs/music/repo-integration-notes.md and docs/music/Canvas_Music_Framework_Spec_v2.md.

Build:
1. packages/music-core with transport, timing, pattern, validation and serialization types.
2. Canvas Music Kernel skeleton with EventBus, PluginRegistry, AgentRegistry and AudioEngine interfaces.
3. MusicKernelProvider wired safely into the app behind a feature flag if needed.

Do not implement Beat Agent UI or audio playback yet.

Acceptance:
- Typecheck passes.
- Tests pass.
- Existing Canvas features still work.
- Kernel initializes without side effects.
```

---

## 35. Third Codex Task Prompt

Use after Phase 1 and 2 are complete:

```text
Implement Phase 3 and Phase 4.

Build:
1. Universal Music Transport MVP.
2. Basic scheduler.
3. Transport UI strip.
4. Postgres migrations and CRUD routes for music_clocks and music_agents.
5. API client methods.

Do not implement Beat Agent playback yet.

Acceptance:
- User can create a project transport.
- Transport can play/stop internally.
- BPM and loop settings can be changed.
- Transport state persists.
- Existing Canvas features still work.
```

---

## 36. Notes for Future Design

The critical long-term decision is to keep **music state**, **sound generation**, **agent reasoning**, **project portability**, and **database persistence** separate.

If these collapse into one implementation, the system will become hard to extend.

Keep the boundaries clean:

```text
AI Layer
  produces structured suggestions

Validation Layer
  checks and sanitizes suggestions

State Layer
  stores accepted changes

Audio Layer
  produces deterministic playback

Project Folder
  stores portable artifact package

Postgres
  stores active project state and history

Canvas UI
  lets the user see, edit, compare and direct the agent
```

---

# End of Specification

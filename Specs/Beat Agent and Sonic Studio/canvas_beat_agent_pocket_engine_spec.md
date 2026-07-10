# Canvas Beat Agent — Pocket Engine Submodule Specification

**Document:** `spec.md`  
**Audience:** Codex / implementation agent  
**Status:** Partial MVP shipped (2026-07-11) — domain engine + UI + worklet integration; see §0.1  
**Scope:** Review the current Beat Agent implementation and propose an isolated Pocket Engine submodule  
**Primary goal:** Add musically coherent drum “pocket” without destabilising the current sequencer, synthesis engine, or artifact model

---

## 0.1 Shipped implementation (2026-07-11)

| Layer | Path | Notes |
|---|---|---|
| Domain engine | `canvas/src/features/music/agents/beat/domain/pocket/PocketEngine.js` | `applyPocket`, `buildPocketSchedule`, profile library, seeded variation |
| Tests | `canvas/src/features/music/agents/beat/domain/pocket/__tests__/PocketEngine.test.js` | Disabled-mode identity, profile ranges |
| State | `beatAgentState.js` | `pocket` normalized on load/patch |
| Schedule payload | `beatClockSync.js` | `buildGlitchSchedule()` composes pocket + glitch |
| UI | `BeatAgentFullscreen.jsx` | `PocketPanel` — enable, bypass, profile, sliders, seed, preview |
| Playback | `public/audio-worklets/beat-agent-processor.js` | `pocketSchedule` event playback |

When pocket is **disabled or bypassed**, schedule timing matches pre-pocket behaviour (regression tested).

**Needs attention:** offline Sonic Core render should consume the same pocket schedule as the worklet; grid overlay visualization deferred.

---

## 1. Purpose

The current Beat Agent can:

- define a step pattern
- assign drum roles such as kick, snare, closed hat, and clap
- synthesize drum sounds
- expose per-sound synthesis controls
- play or render a deterministic drum loop

The next capability is not generic randomness or “humanisation.”

The target is **pocket** in the drumming sense:

> A stable, repeatable, musically intentional relationship between pulse, subdivision, microtiming, dynamics, accents, and the interaction of drum roles.

The proposed implementation must preserve the identity of the programmed beat while allowing it to feel pushed, laid back, deep, tight, loose, swung, or otherwise intentionally placed in time.

The Pocket Engine should be implemented as a bounded submodule between the pattern representation and the synthesis/audio scheduling layer.

---

## 2. Why This Module Exists

A simple step sequencer produces exact grid timing. That is useful for clarity and reproducibility, but exact timing alone often sounds rigid.

Adding random timing offsets is not an adequate solution because it can:

- weaken the kick/snare relationship
- blur the pulse
- create unstable timing from one loop to the next
- make the groove sound sloppy rather than intentional
- prevent reproducibility
- destroy the identity of the original pattern

Pocket is relational rather than random.

Examples:

- the kick may remain close to the grid
- the snare may sit slightly behind it
- hats may push ahead
- a clap may sit later than the snare to create a flam or width
- ghost notes may have lower velocity and a different timing relationship
- subdivision spacing may be asymmetric or swung
- the same timing identity may repeat across bars with only controlled variation

The implementation must therefore distinguish:

```text
Pattern structure
from
Pocket placement
from
Per-hit variation
from
Sound synthesis
```

These are separate concerns and should remain separate in the code.

---

## 3. High-Level Goal

Introduce a `PocketEngine` submodule that transforms deterministic beat events into pocket-aware scheduled events.

```text
Step Pattern
    ↓
Pattern Event Builder
    ↓
Pocket Engine
    ↓
Scheduled Drum Events
    ↓
Synth Voice / Sample Voice
    ↓
Transient / Output Processing
    ↓
Playback or Render
```

The Pocket Engine must:

1. preserve the original step pattern
2. apply role-aware timing relationships
3. apply dynamic and accent contours
4. support swing and subdivision feel
5. support stable, seedable micro-variation
6. remain deterministic when given the same inputs
7. expose inspectable output for UI, debugging, and future agent reasoning
8. avoid direct dependency on Web Audio, UI components, React state, or persistence layers

---

## 4. Required Codebase Review

Before implementing, Codex must inspect the current codebase and produce a concise review.

The review must identify:

### 4.1 Pattern representation

Locate:

- step-grid state
- track or drum-lane state
- bar length
- step resolution
- tempo handling
- active/inactive step representation
- velocity support, if any
- accent support, if any
- probability support, if any

Determine whether the pattern model is:

- UI-owned
- domain-owned
- audio-engine-owned
- duplicated across layers

### 4.2 Scheduling path

Trace a single active step from the UI to sound output.

Identify:

- where step time is converted into seconds
- where notes or voices are scheduled
- whether scheduling is look-ahead based
- whether a worker, timer, animation frame, AudioWorklet, or Web Audio clock is used
- where tempo changes are resolved
- whether events can already carry timing offsets

### 4.3 Synth interface

Identify the interface between a scheduled hit and the drum synth.

Confirm whether a synth trigger currently accepts:

```ts
triggerTime
velocity
pitch
gain
duration
soundId
trackId
parameters
```

or an equivalent structure.

Document any missing fields needed by the Pocket Engine.

### 4.4 Current state ownership

Review:

- React component ownership
- stores or reducers
- artifact persistence
- serialization
- versioning
- undo/redo
- preset storage
- agent state
- render/export path

### 4.5 Existing randomness

Search for:

- `Math.random`
- seed utilities
- probability logic
- humanise controls
- swing controls
- timing jitter
- velocity randomisation

Any unseeded randomness in the timing path should be flagged.

### 4.6 Performance risks

Identify:

- logic executed in the audio callback
- repeated object allocation during playback
- UI state reads from the scheduling loop
- inconsistent use of milliseconds and seconds
- timing calculations that depend on frame rate
- duplicated tempo conversion logic

---

## 5. Deliverables From the Review

Codex should produce:

1. **Current architecture summary**
2. **Relevant file map**
3. **Event flow diagram**
4. **Integration points**
5. **Risks and constraints**
6. **Recommended submodule location**
7. **Minimal patch plan**
8. **Optional refactor plan**
9. **Implementation estimate by phase**
10. **Open questions requiring product decisions**

Do not begin with a broad rewrite.

Prefer the smallest stable integration point that allows the Pocket Engine to remain independent.

---

## 6. Core Design Principle

The Pocket Engine should not rewrite the pattern.

It should transform event placement and articulation.

### Input

```ts
PatternEvent[]
```

### Output

```ts
PocketEvent[]
```

The base pattern remains the source of truth.

The resulting pocket events may contain:

- scheduled time
- timing offset
- role
- velocity
- accent level
- articulation
- source step
- source bar
- generated variation metadata
- trace information

---

## 7. Proposed Module Boundary

Suggested location:

```text
src/
  music/
    beat/
      pocket/
        PocketEngine.ts
        PocketTypes.ts
        PocketProfiles.ts
        PocketMath.ts
        PocketSeed.ts
        PocketTrace.ts
        __tests__/
```

Adapt the path to the current project structure.

The module must be domain-pure:

- no React imports
- no DOM access
- no Web Audio objects
- no direct database calls
- no global mutable state
- no uncontrolled randomness
- no UI-specific labels embedded in the engine

---

## 8. Proposed Domain Types

```ts
export type DrumRole =
  | "kick"
  | "snare"
  | "closedHat"
  | "openHat"
  | "clap"
  | "tom"
  | "rim"
  | "percussion"
  | "unknown";

export interface PatternEvent {
  id: string;
  trackId: string;
  role: DrumRole;
  barIndex: number;
  stepIndex: number;
  stepPosition: number;
  beatPosition: number;
  velocity: number;
  durationBeats?: number;
  accent?: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface PocketEvent extends PatternEvent {
  baseTimeBeats: number;
  pocketTimeBeats: number;
  timingOffsetBeats: number;
  timingOffsetMs: number;
  finalVelocity: number;
  pocketProfileId: string;
  seed: number;
  trace: PocketTraceEntry[];
}

export interface PocketProfile {
  id: string;
  name: string;
  description?: string;

  amount: number;
  swing: number;
  anchorRole: DrumRole | "pulse";

  roleTiming: Partial<Record<DrumRole, RoleTimingRule>>;
  roleDynamics: Partial<Record<DrumRole, RoleDynamicRule>>;

  accentCycle?: number[];
  phraseShape?: number[];
  subdivision?: SubdivisionFeel;
  variation?: PocketVariationConfig;
}

export interface RoleTimingRule {
  offsetMs: number;
  stability: number;
  driftMs?: number;
  anticipationMs?: number;
  lateBiasMs?: number;
}

export interface RoleDynamicRule {
  velocityScale: number;
  velocityBias?: number;
  stability: number;
  ghostThreshold?: number;
  accentResponse?: number;
}

export interface SubdivisionFeel {
  mode: "straight" | "swing" | "shuffle" | "custom";
  amount: number;
  cycleLength?: number;
  offsets?: number[];
}

export interface PocketVariationConfig {
  enabled: boolean;
  timingRangeMs: number;
  velocityRange: number;
  repeatability: number;
  seed: number;
}

export interface PocketContext {
  tempoBpm: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  stepsPerBar: number;
  loopBars: number;
  seed: number;
}

export interface PocketTraceEntry {
  stage:
    | "base"
    | "subdivision"
    | "roleOffset"
    | "accent"
    | "phrase"
    | "variation"
    | "clamp";
  valueBefore: number;
  valueAfter: number;
  reason: string;
}
```

These types are a proposed shape, not a mandatory exact implementation. Codex should adapt them to existing project conventions.

---

## 9. Processing Strategy

The Pocket Engine should use an ordered pipeline.

```text
1. Build base event position
2. Apply subdivision feel
3. Apply role timing offset
4. Apply accent contour
5. Apply phrase contour
6. Apply bounded seeded variation
7. Apply safety clamps
8. Emit traceable scheduled event
```

The order must be explicit and tested.

---

## 10. Timing Model

### 10.1 Use beat-relative values internally

Prefer beat-relative timing as the primary representation.

This supports:

- tempo changes
- deterministic export
- MIDI compatibility
- DAW interoperability
- reusable pocket profiles across BPM values

Milliseconds may still be exposed for UI and role offsets.

Suggested conversion:

```ts
const secondsPerBeat = 60 / tempoBpm;
const millisecondsPerBeat = secondsPerBeat * 1000;
const offsetBeats = offsetMs / millisecondsPerBeat;
```

Do not duplicate this conversion throughout the codebase.

### 10.2 Relational timing

Timing should be defined in relation to the groove anchor.

Example:

```text
Kick:       0 ms
Snare:     +12 ms
Closed hat: -5 ms
Clap:      +18 ms
```

The important property is the relationship between these roles, not independent random jitter.

### 10.3 Stability

Each role requires a stability value.

```text
1.0 = always lands at the target pocket position
0.0 = allowed to vary across the full configured range
```

Recommended default:

```text
Kick stability > snare stability > hat stability
```

Example:

```ts
kick: {
  offsetMs: 0,
  stability: 0.95,
  driftMs: 2,
}

snare: {
  offsetMs: 12,
  stability: 0.85,
  driftMs: 4,
}

closedHat: {
  offsetMs: -5,
  stability: 0.65,
  driftMs: 8,
}
```

---

## 11. Dynamic Model

Pocket depends on repeated dynamic shape, not random velocity.

### 11.1 Accent cycle

An accent cycle may be stored as normalized multipliers.

Example sixteen-step contour:

```ts
[
  1.00, 0.52, 0.74, 0.46,
  0.88, 0.48, 0.70, 0.42,
  0.96, 0.50, 0.76, 0.44,
  0.86, 0.47, 0.68, 0.40,
]
```

The engine should combine:

```text
base velocity
× track velocity
× role dynamic rule
× accent cycle
× phrase shape
+ bounded variation
```

Clamp the result to the engine’s accepted velocity range.

### 11.2 Ghost notes

Ghost notes should be explicit, not inferred solely from randomness.

A future extension may add generated ghost notes, but the first version should only alter the articulation and velocity of existing events unless the product explicitly enables structural mutation.

---

## 12. Swing and Subdivision Feel

Swing must be independent from role offset.

A simple swing implementation may delay selected subdivisions.

Example for sixteenth-note swing:

```text
Step 0: unchanged
Step 1: delayed
Step 2: unchanged
Step 3: delayed
```

The engine should support:

- straight
- swung
- shuffled
- custom offset cycle

Do not encode swing as arbitrary per-event timing jitter.

The same subdivision transform should be reusable by all drum roles unless the profile explicitly overrides it.

---

## 13. Seeded Variation

Any variation must be reproducible.

Do not use `Math.random()` directly in the Pocket Engine.

Required behaviour:

```text
same pattern
+ same profile
+ same tempo
+ same seed
= identical PocketEvent output
```

Variation should be derived from stable identifiers such as:

```text
global seed
track ID
event ID
bar index
step index
role
```

Suggested utility:

```ts
function seededUnitValue(key: string, seed: number): number;
```

The algorithm should produce a stable value in the range `0..1`.

Seeded variation should apply only around a target pocket position.

```text
target timing
+ bounded drift
```

not:

```text
grid timing
+ unconstrained jitter
```

---

## 14. Pocket Profiles

The first implementation should ship with a small profile library.

### 14.1 Tight

```text
Kick: near grid
Snare: near grid
Hats: minimal movement
Swing: low
Variation: low
```

### 14.2 Laid Back

```text
Kick: stable
Snare: delayed
Hats: neutral or slightly late
Clap: later than snare
Variation: moderate
```

### 14.3 Forward

```text
Kick: slightly early
Snare: near grid
Hats: early
Variation: controlled
```

### 14.4 Deep Pocket

```text
Kick: highly stable
Snare: noticeably late
Hats: slightly early or alternating
Ghost articulation: low and soft
Phrase contour: restrained
```

### 14.5 Loose Funk

```text
Kick: mostly stable with selected anticipations
Snare: late
Hats: more dynamic
Accent cycle: strong
Variation: higher but bounded
```

Profiles must be data, not hard-coded branches inside the engine.

---

## 15. UI Strategy

The existing Beat Agent interface should remain centered on the pattern grid and selected drum sound.

Do not overwhelm the current screen with every timing parameter.

Add a compact `Pocket` panel with progressive disclosure.

Suggested primary controls:

```text
POCKET

Profile        Tight / Laid Back / Forward / Deep / Loose Funk / Custom
Amount         0–100%
Swing          0–100%
Snare Drag     milliseconds
Hat Push       milliseconds
Kick Stability 0–100%
Variation      0–100%
Seed           integer
```

Suggested actions:

```text
[Apply Pocket]
[Reset]
[New Seed]
[Freeze Seed]
[Save Profile]
```

Advanced disclosure:

```text
Role timing
Accent contour
Subdivision feel
Dynamics
Phrase shape
Per-role stability
Trace
```

### 15.1 Keep “Pocket” distinct from “Randomness”

Do not label the feature primarily as:

- Random
- Humanise
- Jitter
- Chaos

A future `Humanise` macro may exist, but it should drive the Pocket Engine’s bounded parameters rather than adding unrelated randomness.

### 15.2 Visualisation

Optional but recommended:

- ghosted grid position
- actual scheduled position
- per-role timing marker
- accent intensity
- loop comparison
- original vs pocketed playback

Example:

```text
Grid hit:       |
Pocketed hit:      |
Offset:        +12 ms
```

---

## 16. Integration With the Beat Agent

The agent should reason over pocket as an explicit musical object.

Example agent commands:

```text
Make the groove more laid back without moving the kick.
Push the hats forward but keep the snare deep.
Tighten the beat while preserving its current swing.
Create a deeper pocket with subtle two-bar variation.
Make the clap sit behind the snare.
```

The agent should modify a `PocketProfile` or instance parameters, not directly mutate scheduled timestamps.

Suggested action contract:

```ts
interface UpdatePocketAction {
  profileId?: string;
  amount?: number;
  swing?: number;
  roleTiming?: Partial<Record<DrumRole, Partial<RoleTimingRule>>>;
  roleDynamics?: Partial<Record<DrumRole, Partial<RoleDynamicRule>>>;
  seed?: number;
}
```

The action should be validated before reaching the domain engine.

---

## 17. Persistence and Artifact Versioning

Pocket settings should be part of the music artifact state.

Suggested artifact shape:

```ts
interface BeatArtifact {
  version: number;
  pattern: BeatPattern;
  sounds: BeatSoundState;
  pocket?: {
    enabled: boolean;
    profileId: string;
    customProfile?: PocketProfile;
    seed: number;
  };
}
```

Requirements:

- older artifacts without pocket data must still load
- pocket-disabled artifacts must sound identical to current behaviour
- serialization must be deterministic
- profile versions should be migratable
- preset IDs must not depend on UI labels

---

## 18. Backward Compatibility

This is mandatory.

When pocket is disabled:

```text
PocketEngine output timing = current scheduling timing
PocketEngine output velocity = current velocity
```

The current deterministic loop must remain unchanged.

Add regression tests before activating pocket by default.

Do not silently alter existing saved artifacts.

---

## 19. Safety Constraints

The Pocket Engine must prevent invalid or musically destructive output.

Recommended constraints:

- do not schedule an event before the start of the render unless explicitly wrapped
- do not move events across bar boundaries unless enabled
- clamp velocity
- clamp timing offsets
- prevent event reordering where it would break the intended role sequence
- preserve active-step identity
- do not generate additional hits in version 1
- do not delete existing hits in version 1
- prevent NaN and infinite values
- preserve deterministic ordering for simultaneous events

Optional setting:

```ts
boundaryMode: "clamp" | "wrap" | "allow";
```

Use `clamp` as the initial default.

---

## 20. Testing Strategy

### 20.1 Unit tests

Test:

- beat-to-time conversion
- millisecond-to-beat conversion
- role offset application
- swing transforms
- accent cycles
- phrase contours
- seeded values
- stability behaviour
- velocity clamping
- timing clamping
- deterministic output
- disabled-mode identity

### 20.2 Property tests

Useful invariants:

```text
same inputs produce same outputs
disabled pocket produces zero timing offset
all output velocities remain valid
all events retain source event IDs
event count remains unchanged in version 1
no output contains NaN
```

### 20.3 Golden fixtures

Create fixed examples:

- one-bar four-on-the-floor
- laid-back backbeat
- forward hats
- deep pocket
- loose funk
- swing at multiple BPM values

Store expected output snapshots.

### 20.4 Audio scheduling tests

Where possible, verify:

- event order
- sub-frame scheduling precision
- loop boundary behaviour
- tempo changes
- offline rendering parity with live playback

### 20.5 UI tests

Test:

- enabling/disabling pocket
- changing profile
- resetting
- seed persistence
- advanced controls
- old artifact loading
- undo/redo
- saved artifact reload

---

## 21. Acceptance Criteria

The implementation is complete when:

1. the current beat plays identically with pocket disabled
2. a Pocket Profile can be applied without modifying the base step pattern
3. kick, snare, hat, and clap can receive different timing relationships
4. swing is separate from role timing
5. velocity follows a repeatable accent contour
6. all variation is seeded and reproducible
7. the same inputs produce the same outputs
8. Pocket Events expose timing and velocity trace data
9. pocket settings persist with the artifact
10. old artifacts load without migration failure
11. live playback and offline render use the same Pocket Engine output
12. the code remains isolated from React and Web Audio
13. tests cover disabled mode, profile mode, custom mode, and multiple tempos
14. no uncontrolled random function remains in the pocket path

---

## 22. Phased Implementation

### Phase 0 — Review

- inspect current architecture
- document event flow
- identify integration point
- identify backward-compatibility risks
- recommend module path

### Phase 1 — Pure Pocket Engine

Implement:

- types
- role timing offsets
- beat/time conversion
- swing
- accent cycle
- seeded variation
- trace output
- unit tests

No UI work in this phase.

### Phase 2 — Scheduler Integration

- insert Pocket Engine before synth triggering
- preserve disabled behaviour
- verify live playback
- verify offline render
- add regression fixtures

### Phase 3 — Minimal UI

Add:

- enable
- profile selector
- amount
- swing
- seed
- reset
- per-role advanced controls

### Phase 4 — Artifact Persistence

- save/load
- migration
- undo/redo
- profile versioning

### Phase 5 — Agent Controls

- agent action schema
- semantic commands
- validation
- traceable changes

### Phase 6 — Future Extensions

Not part of the initial implementation:

- learned pocket extraction from recorded drumming
- MIDI groove import
- audio transient analysis
- generated ghost notes
- structural pattern mutation
- multi-bar fill generation
- drummer-specific style models
- cross-track pocket relationships with bass
- adaptive pocket based on phrase energy
- groove transfer between artifacts

---

## 23. Non-Goals for Version 1

Do not include:

- AI-generated pattern rewriting
- audio-to-MIDI transcription
- automatic drum classification
- arbitrary hit insertion
- arbitrary hit deletion
- sample slicing
- Drum Rack export
- transient shaping
- mastering
- multi-agent orchestration
- live microphone analysis

These may be added later but should not be allowed to blur the Pocket Engine’s responsibility.

---

## 24. Architectural Decision Summary

### Decision

Create a pure domain submodule that transforms pattern events into pocket-aware scheduled events.

### Why

Because pocket is:

- relational
- repeatable
- role-aware
- tempo-aware
- musically intentional
- distinct from pattern generation
- distinct from sound synthesis
- distinct from random humanisation

### Why not place it in the UI

Because pocket must also affect:

- playback
- offline render
- export
- agent actions
- saved artifacts
- future MIDI output

### Why not place it inside the synth

Because timing and accent relationships exist before a sound voice is created.

### Why not use random jitter

Because random jitter does not create a stable rhythmic identity.

### Why seed variation

Because the user must be able to:

- reproduce a groove
- compare versions
- save a result
- undo changes
- render the same output
- let an agent modify the groove predictably

---

## 25. Required Codex Response Format

Codex should respond with the following sections before editing code:

```text
1. Current Architecture
2. Relevant Files
3. Current Event Flow
4. Proposed Integration Point
5. Proposed Module API
6. Data Model Changes
7. UI Changes
8. Persistence Changes
9. Risks
10. Test Plan
11. Implementation Phases
12. Open Questions
```

After review, Codex should provide a patch plan.

Do not begin broad refactoring until the review is accepted.

---

## 26. Final Product Principle

The Beat Agent should not merely make exact beats less exact.

It should establish a coherent rhythmic relationship that the listener experiences as intentional.

```text
Grid gives structure.
Pocket gives placement.
Dynamics give shape.
Repetition gives identity.
Controlled variation gives life.
```

# Canvas Beat Agent - Glitch / Mutation Engine Submodule Specification

**Audience:** Codex / implementation agent  
**Status:** Partial MVP shipped (2026-07-11) — event engine + UI + worklet; offline parity and Phase 2 sonic overrides deferred  
**Language:** JavaScript, ES modules, and JSDoc  
**Primary goal:** Add evolving, repeatable, musically controlled glitch behaviour over a sequenced beat without weakening the underlying pattern, pocket, or render determinism.

---

## 0.1 Shipped implementation (2026-07-11)

| Layer | Path | Notes |
|---|---|---|
| Domain engine | `canvas/src/features/music/agents/beat/domain/glitch/GlitchEngine.js` | `applyGlitch`, `buildGlitchSchedule`, profiles, phrase blocks |
| Tests | `canvas/src/features/music/agents/beat/domain/glitch/__tests__/GlitchEngine.test.js` | Determinism, bypass, operations |
| State | `beatAgentState.js`, `beatRuntimeState.js` | `glitch` normalized; debounced patches |
| Schedule payload | `beatClockSync.js` | Cached payload includes `pocketSchedule` from `buildGlitchSchedule()` |
| UI | `BeatAgentFullscreen.jsx` | `GlitchPanel` — enable, bypass, profile, operation weights, preview |
| Worklet | `beat-agent-processor.js` | Phrase-frame wrap; `pitchOffsetSemitones`, `gate`, `durationFrames`, `operation` |

**Known gaps — needs further attention:**

- **Offline render parity** — live worklet path is primary; Sonic Core offline beat adapter must use the same expanded schedule
- **Dense schedule stress** — high ratchet/stutter counts under rapid transport changes
- **Phase 2 sonic overrides** — filter/tone/material/temporal fields in spec profiles are not yet applied to voices

When glitch is **disabled or bypassed**, output matches pocket-only (or grid-only when pocket off) behaviour.

---

## 1. Purpose

The Beat Agent already has a deterministic beat model, an implemented Pocket Engine, Sonic Core integration, and an AudioWorklet playback path.

This specification defines a **Glitch / Mutation Engine** that sits after pocket timing and before synthesis/playback scheduling.

The goal is not arbitrary chaos. The goal is:

> A controlled event-expansion layer that creates stutters, ratchets, dropouts, repeats, pitch changes, gates, and phrase-sensitive mutations across repeated loops while preserving the identity of the original groove.

---

## 2. Current System Alignment

The current codebase already includes:

- Beat pattern state in `packages/music-core/src/patterns/beatPattern.js`
- Pocket Engine in `src/features/music/agents/beat/domain/pocket/PocketEngine.js`
- Beat Agent state persistence in `src/features/music/agents/beat/domain/beatAgentState.js`
- Worklet payload construction in `src/features/music/agents/beat/domain/beatClockSync.js`
- AudioWorklet playback in `public/audio-worklets/beat-agent-processor.js`
- Sonic Core offline beat rendering in `packages/sonic-core/src/integration/beatAdapter.js`

The Glitch Engine must fit this existing path rather than inventing a parallel scheduler.

Current effective chain:

```text
BeatAgentState.pattern
  -> buildPatternEvents()
  -> applyPocket()
  -> buildPocketSchedule()
  -> beat-agent-processor AudioWorklet
  -> generated or Sonic voice playback
```

Target chain:

```text
BeatAgentState.pattern
  -> buildPatternEvents()
  -> applyPocket()
  -> applyGlitch()
  -> buildBeatSchedule()
  -> AudioWorklet playback and Sonic Core offline render
```

The current `buildPocketSchedule()` should eventually be split so pocket, glitch, and schedule formatting are independent stages.

---

## 3. Responsibility Boundaries

```text
Pattern Layer
  Defines what hits exist.

Pocket Engine
  Defines how those hits sit in time and dynamics.

Glitch / Mutation Engine
  Defines repeatable event-level variation across loops and phrases.

Sonic / Beat Voice Layer
  Generates the sound for each trigger.

Temporal / FX Layer
  Processes audio after trigger generation.

Output / Render
  Plays, records, exports, or renders the result.
```

### Why Pocket Comes Before Glitch

Pocket establishes the groove identity. The Glitch Engine should mutate events that already have intentional timing and dynamics, so a glitched beat can still feel tight, laid back, forward, deep, or loose.

### Why Glitch Comes Before Synthesis

Most V1 glitch operations are event-level transformations:

- retriggering
- muting a trigger
- duplicating a trigger
- changing local subdivision
- changing per-trigger pitch
- shortening a trigger
- copying an event to a nearby rhythmic position

These decisions should be made before the synth or sample voice is triggered.

### What Does Not Belong In V1 Glitch

Audio-buffer operations belong later unless the current voice path explicitly supports them:

- granular slicing
- time stretching
- spectral mutation
- generated-synth reverse playback
- audio-buffer reordering
- live feedback capture

Reverse may be supported only for sample-backed voices if the worklet and sample reader explicitly implement it.

---

## 4. Core Design Principles

The base pattern remains the source of truth.

```text
PatternEvent[]
  -> PocketEvent[]
  -> GlitchEvent[]
  -> ScheduleEvent[]
```

The Glitch Engine must be:

- non-destructive
- deterministic with the same seed
- loop-aware
- phrase-aware
- role-aware
- inspectable
- reversible by bypass
- independent from React
- independent from Web Audio
- independent from persistence
- independent from synth implementation details
- safe for live playback and offline rendering

The engine must not:

- mutate stored sequencer pattern state
- use unseeded `Math.random()`
- read React state
- create Web Audio nodes
- allocate or serialize data inside an audio callback
- depend on UI labels for IDs

---

## 5. Required Codebase Review

Before implementation, Codex must inspect the current codebase and report:

1. Current architecture
2. Relevant files
3. Current event flow
4. Pocket Engine relationship
5. Recommended Glitch Engine placement
6. Scheduler/worklet changes
7. Synth and sample API changes
8. Proposed module API
9. Data model changes
10. UI changes
11. Persistence changes
12. Offline render changes
13. Risks
14. Suggested improvements
15. Alternative architectures
16. Test plan
17. Phased implementation
18. Open questions

Codex must state where it agrees or disagrees with this specification before broad implementation.

---

## 6. Recommended Module Boundary

Smallest fit for the current codebase:

```text
src/features/music/agents/beat/domain/glitch/
  GlitchEngine.js
  glitchProfiles.js
  glitchSeed.js
  glitchRules.js
  glitchSafety.js
  glitchTrace.js
  index.js
  __tests__/
```

Longer-term fit after both pocket and glitch stabilize:

```text
packages/music-core/src/beat/
  pocket/
  glitch/
  schedule/
```

Do not move Pocket Engine during the first glitch implementation unless the migration is explicitly accepted.

---

## 7. Event Contracts

The implementation should adapt to existing event shapes, but the target contracts are:

```js
/**
 * @typedef {"kick"|"snare"|"hat"|"closedHat"|"openHat"|"clap"|"tom"|"rim"|"percussion"|"unknown"} DrumRole
 */

/**
 * @typedef {Object} PocketEvent
 * @property {string} id
 * @property {string} trackId
 * @property {DrumRole} role
 * @property {number} sourceStep
 * @property {number} barIndex
 * @property {number} beatPosition
 * @property {number} baseTimeBeats
 * @property {number} pocketTimeBeats
 * @property {number} timingOffsetBeats
 * @property {number} timingOffsetMs
 * @property {number} finalVelocity
 * @property {boolean} enabled
 * @property {Record<string, unknown>=} metadata
 * @property {Array<Record<string, unknown>>=} trace
 */

/**
 * @typedef {Object} GlitchEvent
 * @property {string} id
 * @property {string} sourceEventId
 * @property {string} mutationId
 * @property {string} trackId
 * @property {DrumRole} role
 * @property {number} sourceStep
 * @property {number} loopIndex
 * @property {number} phraseIndex
 * @property {number} scheduledBeat
 * @property {number} velocity
 * @property {number=} pitchOffsetSemitones
 * @property {number=} durationBeats
 * @property {number=} gate
 * @property {boolean=} reverse
 * @property {boolean=} muted
 * @property {string=} operation
 * @property {Array<Record<string, unknown>>} trace
 */

/**
 * @typedef {Object} GlitchContext
 * @property {number} tempoBpm
 * @property {number} stepsPerBar
 * @property {number} loopBars
 * @property {number} loopIndex
 * @property {number} phraseLengthLoops
 * @property {number} phraseIndex
 * @property {boolean} isPhraseStart
 * @property {boolean} isPhraseEnd
 * @property {number} seed
 * @property {number=} energy
 */
```

### Worklet Schedule Event Extension

The current worklet schedule event is too narrow for glitch. V1 should extend it to:

```js
{
  timeFrames,
  trackId,
  role,
  sourceStep,
  velocity,
  probabilityPass,
  articulation,
  pitchOffsetSemitones,
  durationFrames,
  gate,
  reverse,
  sourceEventId,
  mutationId,
  operation,
  traceId
}
```

The worklet must clamp every numeric field and ignore unsupported fields safely.

---

## 8. Processing Strategy

Use an explicit ordered pipeline:

```text
1. Receive PocketEvents
2. Build loop and phrase context
3. Select eligible source events
4. Apply role rules
5. Select mutation operation
6. Generate one or more GlitchEvents
7. Apply safety constraints
8. Apply reset / return-to-base logic
9. Sort events deterministically
10. Emit traceable output
11. Convert to ScheduleEvents outside the audio callback
```

The processing order must be tested.

---

## 9. Phrase-Block Scheduling

The spec requires loop and phrase evolution. A one-loop schedule cannot express:

```text
Loop 1: base groove
Loop 2: light hat mutation
Loop 3: snare stutter
Loop 4: fill
Loop 5: reset
```

Therefore V1 should generate a **phrase block**:

```text
phraseLengthLoops = 1..8
phraseFrames = loopFrames * phraseLengthLoops
```

The worklet should schedule against phrase-frame position and wrap after `phraseFrames`.

If phrase-block worklet support is too large for V1, then V1 must explicitly limit itself to one-loop glitches and defer phrase evolution. It should not claim loop-to-loop development until phrase scheduling exists.

---

## 10. Version 1 Glitch Operations

V1 should prove event-level value before audio-buffer tricks.

### 10.1 Stutter

Repeat one event rapidly within a short window.

Parameters:

- repeat count
- interval beats
- velocity decay
- pitch progression
- gate

### 10.2 Ratchet

Divide the original step space into repeated tempo-relative triggers.

```text
one sixteenth-note hat -> four sixty-fourth-note hats
```

### 10.3 Dropout

Mute a selected event. Primary kick and snare anchors are protected by default.

### 10.4 Repeat

Copy an event to a nearby rhythmic position. This differs from stutter because the interval may be larger.

### 10.5 Pitch Offset

Apply per-trigger pitch offsets where the worklet or Sonic Core path supports it.

Defaults:

- hats and percussion: wider movement
- kick: narrow movement
- snare/clap: moderate movement

### 10.6 Gate / Duration

Shorten a trigger by passing `gate` or `durationFrames` to the playback layer.

### 10.7 Subdivision Burst

Temporarily increase local rhythmic density using bounded ratchet/stutter events.

### Deferred From V1

- reorder
- generated-synth reverse
- granular slicing
- time stretching
- spectral mutation
- recursive mutation of generated events

---

## 11. Phase 2 Sonic Potential

Once the V1 event engine is deterministic, tested, and integrated, Phase 2 should expand glitch from rhythmic mutation into **per-trigger sonic transformation**.

Phase 2 does not replace the event layer. It adds expressive sound-shaping fields that each generated trigger can carry into Sonic Core, sample playback, or the worklet.

### 11.1 Per-Trigger Sonic Overrides

Extend `GlitchEvent` and schedule events with optional sonic metadata:

```js
{
  pitchOffsetSemitones,
  gate,
  durationBeats,
  gain,
  pan,
  toneOffset,
  distortionAmount,
  filterCutoffRatio,
  attackScale,
  decayScale,
  sendLevel,
  materialShift,
  contactShift,
  gestureOverride,
  temporalSend
}
```

Only fields supported by the current voice path should be active. Unsupported fields must be ignored, not silently faked.

### 11.2 Sonic-Core-Aware Glitch

For tracks using Sonic voices, Phase 2 may map glitch operations into Sonic Core concepts:

```text
stutter -> contact bounce / repeated gesture
ratchet -> gesture repetition + shorter contact duration
gate -> decayScale / damping increase
pitch glitch -> body tension / resonator pitch shift
metallic glitch -> material hardness / inharmonicity lift
broken texture -> contact friction / noise layer increase
```

This makes glitch feel like a transformation of the instrument, not only the sequencer.

### 11.3 Sample Playback Enhancements

For sample-backed tracks, Phase 2 may add:

- reverse playback
- start offset
- end offset
- per-trigger playback rate
- short fade in/out
- transient trimming
- one-shot slice windows

Generated synth voices should not claim support for these until equivalent buffer or renderer support exists.

### 11.4 Temporal / FX Sends

Phase 2 may let glitch operations influence post-trigger routing:

- stuttered hits send more to delay
- phrase-end fills bloom into shimmer/reverb
- dropouts leave only FX tails
- gated repeats are drier
- broken profiles increase temporal diffusion

This should be implemented as bounded event metadata and routing parameters, not by creating new FX nodes per event.

### 11.5 Sonic Safety

Add hard clamps for:

- total per-beat gain
- feedback send
- pitch range
- playback rate
- distortion amount
- filter cutoff
- simultaneous tails
- maximum generated event count

Phase 2 is complete only when the sonic transformations are deterministic in live playback and offline render.

---

## 12. Role-Aware Mutation

Profiles should define role rules as data.

### Kick

- preserve the primary downbeat
- low dropout probability
- narrow pitch range
- low ratchet count
- short stutters only when explicitly enabled

### Snare

- preserve primary backbeats
- allow phrase-end stutters
- allow gated repeats
- moderate pitch movement

### Hats

- high mutation tolerance
- higher ratchet count
- wider pitch movement
- allow dropouts, gates, and subdivisions

### Clap

- allow flam-like repeats
- allow late gated copies
- moderate pitch movement

### Percussion

- high mutation tolerance
- allow wider pitch movement
- allow reverse where sample playback supports it

---

## 13. Deterministic Seeded Behaviour

Required invariant:

```text
same PocketEvents
+ same glitch profile
+ same loop/phrase context
+ same seed
= identical GlitchEvents
```

Seed derivation should include:

- global seed
- profile ID
- source event ID
- track ID
- role
- loop index
- phrase index
- operation name

Suggested utility:

```js
function seededUnitValue(key, seed) {
  // Return a stable value from 0 to 1.
}
```

The glitch path must not call `Math.random()`.

Existing non-glitch randomness in legacy/direct preview paths should be audited. If those paths remain active for Beat Agent playback, they should be converted to seeded random or excluded from deterministic guarantees.

---

## 14. Density Model

User-facing `amount` should not map directly to one raw probability.

Use:

```text
amount
* density
* role probability
* operation weight
* phrase bias
* loop position
* reset strength
* safety clamps
```

Phrase ends may increase density. Phrase starts may reduce density to preserve reset.

---

## 15. Safety Constraints

Recommended defaults:

```js
{
  maxEventsPerSource: 8,
  maxEventsPerBeat: 16,
  maxEventsPerPhrase: 512,
  maxPitchShiftSemitones: 12,
  maxTimingShiftBeats: 0.25,
  maxGateMin: 0.05,
  preserveDownbeat: true,
  preserveBackbeat: true,
  allowCrossBar: false,
  allowReverse: false
}
```

The engine must:

- preserve first downbeat by default
- preserve primary backbeats by default
- prevent negative scheduled times
- prevent uncontrolled cross-bar movement
- reject NaN and infinite values
- sort simultaneous events deterministically
- prevent recursive mutation
- prevent re-mutating generated events in V1
- provide complete bypass

The worklet must also protect itself against dense output by clamping schedule events and voice counts.

---

## 16. Performance Strategy

Avoid:

- regenerating a full phrase every animation frame
- reading React state inside playback
- allocating arrays in the audio callback
- scanning huge schedules per sample frame
- serializing JSON in the hot path

Recommended strategy:

```text
Generate a phrase block on the UI/control thread.
Cache by pattern + pocket + glitch + tempo + sampleRate + seed.
Send compact ScheduleEvents to the worklet.
Use cursor or bucketed event lookup in the worklet for dense schedules.
Invalidate only when relevant state changes.
```

Dense stutters and ratchets should not ship until the worklet scheduling path is safe under stress tests.

---

## 17. UI Strategy

Keep the Glitch UI compact and secondary to the sequencer.

Primary controls:

```text
GLITCH

Enabled
Profile
Amount
Density
Phrase Bias
Phrase Length
Seed
```

Operation controls:

```text
Stutter
Ratchet
Dropout
Repeat
Pitch
Gate
```

Actions:

```text
New Seed
Freeze Seed
Reset
Save Profile
```

Advanced disclosure:

```text
Role Rules
Phrase Behaviour
Operation Weights
Safety Limits
Trace
Sonic Overrides
```

Trace display should explain:

```text
Source: Snare step 13
Pocket: +11 ms
Mutation: 4-hit stutter
Loop: 4 of 4
Reason: phrase-end bias
```

---

## 18. Suggested Profiles

Profiles should be data-driven.

### Subtle

- low density
- mostly hats and percussion
- rare dropouts
- short gated repeats
- strong reset

### Stutter

- moderate density
- high stutter weight
- phrase-end snare/hat focus
- low dropout

### Broken

- moderate dropout
- moderate repeat
- moderate pitch
- protected anchors

### IDM

- high ratchet
- high subdivision burst
- moderate pitch movement
- strong phrase structure

### Fill Driven

- low mutation during phrase
- high mutation at phrase end
- strong reset at phrase start
- mostly snare, hats, and percussion

### Sonic Fracture

- Phase 2 profile
- per-trigger pitch/gate/filter changes
- temporal send bursts
- material/contact shifts for Sonic voices
- sample reverse only where supported

---

## 19. Agent Integration

The Beat Agent should treat glitch as an explicit musical object.

Example commands:

```text
Add subtle hat glitches every fourth loop.
Create a snare stutter at the end of each phrase.
Keep the kick stable but break up the hats.
Make the loop progressively more fractured over eight repeats.
Return to the clean groove at the start of each phrase.
Use the same pocket but generate a new glitch seed.
Make the stutters more metallic without changing the base pattern.
```

The agent should modify glitch profile or instance parameters, not final scheduler timestamps.

---

## 20. Persistence and Versioning

Suggested Beat Agent state extension:

```js
{
  schemaVersion: 1,
  pattern,
  pocket,
  glitch: {
    enabled: false,
    profileId: "subtle",
    amount: 0.35,
    density: 0.25,
    phraseBias: 0.5,
    phraseLengthLoops: 4,
    seed: 18429,
    operations: {
      stutter: 0.4,
      ratchet: 0.3,
      dropout: 0.15,
      repeat: 0.2,
      pitch: 0.15,
      gate: 0.2
    },
    sonic: {
      enabled: false,
      intensity: 0,
      temporalSend: 0,
      materialShift: 0
    },
    safety: null
  }
}
```

Requirements:

- old Beat Agent states without glitch data still load
- glitch-disabled playback matches current output
- seed persists
- profile versions are migratable
- agent changes are undoable
- folder-backed `beat.agent.json` includes glitch state
- live playback and offline render use the same glitch configuration

---

## 21. Offline Render Parity

The current Sonic Core offline beat path converts patterns directly to percussion events. Glitch requires a shared schedule-to-render adapter.

Add:

```text
PocketEvents + GlitchEvents
  -> ScheduleEvents
  -> Worklet playback
  -> Sonic Core render events
```

Offline rendering must consume the same deterministic expanded event block as live playback. It should not rebuild its own independent random variation.

Acceptance:

- same state + seed renders the same event list
- live and offline paths agree on event times, velocities, pitch offsets, and gates
- unsupported sonic fields are dropped consistently

---

## 22. Testing Strategy

### Unit Tests

Test:

- deterministic seed output
- bypass identity
- event selection
- role protection
- stutter generation
- ratchet generation
- dropout
- repeat
- pitch offset
- gate
- phrase bias
- reset behaviour
- safety clamps
- deterministic sorting

### Property Invariants

```text
same inputs produce same outputs
bypass preserves PocketEvents
all GlitchEvents reference a source event
event count remains within safety limits
protected anchors remain present
all scheduled times are finite
all velocities remain valid
no recursive mutation occurs
```

### Integration Tests

Verify:

- live playback
- offline render
- start/stop
- loop boundaries
- phrase boundaries
- tempo change
- profile switch
- seed switch
- pocket plus glitch
- artifact save/load

### Stress Tests

Test:

- maximum ratchet density
- many simultaneous events
- rapid tempo
- long phrases
- multiple tracks
- frequent parameter changes
- repeated start/stop
- render consistency

---

## 23. Acceptance Criteria

V1 is complete when:

1. base pattern remains unchanged
2. PocketEvents are accepted as input
3. bypass playback matches current output
4. one event can safely generate multiple GlitchEvents
5. mutations can vary across phrase loops
6. phrase-end bias works
7. phrase reset works
8. role rules protect primary anchors
9. all variation is deterministic and seeded
10. stutter, ratchet, dropout, repeat, pitch offset, and gate are supported
11. unsupported operations are explicitly excluded
12. live playback and offline render share the same expanded event block
13. trace data explains each mutation
14. saved Beat Agent state reproduces the same result
15. tests cover safety limits and bypass behaviour
16. no unseeded randomness exists in the glitch path
17. the module remains independent from React and Web Audio
18. worklet scheduling remains stable under stress tests

Phase 2 sonic expansion is complete when:

1. per-trigger sonic overrides are represented as explicit metadata
2. supported overrides affect live playback
3. supported overrides affect offline render
4. unsupported overrides are ignored safely
5. Sonic voice mappings are deterministic
6. sample-only behaviours are not exposed for generated voices
7. sonic safety clamps prevent runaway gain, pitch, feedback, and voice count

---

## 24. Phased Implementation

### Phase 0 - Review and Refine

Codex must:

- map current Beat Agent playback
- inspect Pocket Engine integration
- inspect worklet schedule shape
- inspect offline render path
- inspect existing randomization
- recommend exact insertion point
- propose the smallest patch plan

No broad refactor in this phase.

### Phase 1 - Event-Level Glitch Engine

Implement:

- glitch state normalization
- profile library
- seeded selection
- phrase-block event generation
- stutter
- ratchet
- dropout
- repeat
- pitch offset metadata
- gate metadata
- safety limits
- trace output
- unit tests

Integrate only far enough to produce deterministic expanded event blocks. UI can remain minimal or absent.

### Phase 2 - Sonic Potential Expansion

Expand the musical/sonic effect of glitch after Phase 1 is stable.

Implement:

- per-trigger sonic override contract
- worklet support for pitch offset, gate, duration, gain, and optional filter/tone changes
- Sonic Core render support for the same overrides
- sample-only reverse/start-offset if supported safely
- Sonic voice mappings for material/contact/gesture shifts
- temporal send modulation for phrase-end glitch events
- sonic safety clamps
- tests for live/offline parity

Do not add granular/time-stretch/spectral processing in this phase unless the audio engine explicitly supports it.

### Phase 3 - Scheduler and Worklet Hardening

Implement:

- phrase-frame scheduling
- bucketed or cursor-based worklet event scanning
- cancellation on stop/pattern change
- voice-count limits
- regression tests for dense schedules
- parity tests for tempo and loop changes

### Phase 4 - Minimal UI

Add:

- enable
- profile selector
- amount
- density
- phrase bias
- phrase length
- seed
- operation toggles
- reset/new seed
- trace inspector

### Phase 5 - Persistence and Migration

Add:

- save/load
- old-state defaulting
- folder-backed JSON persistence
- profile versioning
- undo/redo integration
- preset storage

### Phase 6 - Agent Controls

Add:

- validated action schema
- semantic command mapping
- profile updates
- seed actions
- traceable agent changes

### Future Extensions

Not part of V1 or Phase 2:

- granular processing
- spectral mutation
- time stretching
- live audio feedback
- cross-track mutation with bass or synth
- learned glitch styles
- gesture control
- adaptive mutation from arrangement energy
- MIDI export of expanded glitch events
- committing frozen mutations back into the pattern

---

## 25. Non-Goals

Do not include in V1:

- pattern generation from scratch
- audio-to-MIDI
- sample slicing UI
- Drum Rack generation
- granular synthesis
- mastering
- full arrangement generation
- uncontrolled chaos mode
- AI deciding every hit in real time
- direct mutation of the source pattern
- hidden non-reproducible variation

---

## 26. Architectural Decision Summary

### Decision

Create a pure Glitch / Mutation Engine that consumes PocketEvents and emits derived GlitchEvents.

### Why

Glitch behaviour is:

- loop-aware
- phrase-aware
- role-aware
- structurally different from pocket
- structurally different from synthesis
- structurally different from transient/FX processing
- best represented as an event transformation layer

### Why Not Put It In Pattern

The base pattern should remain stable, editable, and recoverable.

### Why Not Put It In Pocket

Pocket controls placement and feel. Glitch controls mutation and development.

### Why Not Put It In Synth

Many glitch operations alter event count, order, timing, and articulation before sound generation.

### Why Phase 2 Sonic Expansion Exists

Rhythmic glitch proves the architecture. Sonic glitch gives the feature its deeper musical identity by letting each generated trigger carry controlled sound-shaping intent.

---

## 27. Final Product Principle

The Glitch Engine should not merely make a beat unpredictable.

It should make repetition develop.

```text
Pattern gives identity.
Pocket gives feel.
Glitch gives evolution.
Sonic transformation gives character.
Processing gives impact.
```

The base groove must remain strong enough that mutation feels intentional rather than accidental.

# Sonic Studio Architecture Specification

**Version:** 1.0  
**Target:** Canvas monorepo / standalone-pluggable Sonic Studio subsystem  
**Primary implementation target:** Codex / Cursor  
**Status:** Build specification

---

## 1. Executive Summary

Sonic Studio should be built as a **standalone-pluggable audio subsystem** that Canvas consumes through artifacts, APIs, and UI panels.

Canvas should orchestrate projects, artifacts, history, agents, and user workflows. Sonic Studio should own the real-time audio engine, DSP graph, instrument models, modulation, render pipeline, sound state, and audio-specific testing.

The initial scope is generative percussion with familiar entry points:

- Kick
- Snare
- Hat
- Cymbal

But the architecture must evolve naturally into:

- pads
- drones
- shimmer effects
- resonators
- granular textures
- physical interaction instruments
- morphing sonic spaces
- agent-generated sound design

The core abstraction is:

```text
Sound = Body × Material × Contact × Gesture × Position × Environment × Time
```

The first implementation should not be a fixed drum machine. It should be a modular physical-temporal audio kernel with percussion as the first use case.

---

## 2. Recommended Repository Architecture

Use a monorepo package structure first. Do not split Sonic Studio into a separate repository yet.

```text
canvas-repo/
  apps/
    canvas/
      src/
        features/
          sonicStudio/
            SonicArtifactView.tsx
            SonicStudioBridge.ts
            SonicProjectPanel.tsx

  packages/
    sonic-core/
      src/
        audio/
        dsp/
        graph/
        instruments/
        modulation/
        morph/
        render/
        scheduling/
        state/
        testing/
        types/

    sonic-ui/
      src/
        components/
        panels/
        sonic-space/
        controls/
        visualizers/

    sonic-agent/
      src/
        schemas/
        actions/
        validators/
        prompt-contracts/

    sonic-presets/
      src/
        percussion/
        shimmer/
        resonators/
        materials/
```

### Package responsibilities

| Package | Responsibility |
|---|---|
| `sonic-core` | Real-time DSP, audio graph, instruments, effects, render engine |
| `sonic-ui` | React controls, sonic map, instrument editors, visualizers |
| `sonic-agent` | Agent schemas, validated actions, prompt contracts |
| `sonic-presets` | Presets, material libraries, morph maps |
| `apps/canvas` | Artifact orchestration, project storage, canvas integration |

---

## 3. Build Philosophy

### 3.1 Canvas should not own DSP

Canvas should call Sonic Studio through a stable API.

```ts
const engine = await createSonicEngine();

engine.createVoice("kick");
engine.updateVoiceParams(voiceId, params);
engine.previewEvent(event);
engine.renderClip(renderRequest);
engine.saveState();
```

Canvas artifacts store:

- sound state
- presets
- references
- generated files
- run history
- agent actions
- user decisions

Sonic Studio owns:

- audio thread
- DSP graph
- modulation
- timing
- rendering
- audio state validation

### 3.2 Engine first, UI second

Implement deterministic DSP primitives and offline render tests before building advanced UI.

### 3.3 Percussion first, pads/drones compatible

The same kernel must later support sustained sounds. Avoid one-shot-only assumptions.

Every module must support both:

```text
Percussive event: short excitation into resonant body
Sustained voice: continuous excitation into resonant / temporal system
```

---

## 4. Runtime Architecture

```text
Canvas UI
  ↓
Sonic Studio Bridge
  ↓
Sonic Engine Controller
  ↓
Audio Graph
  ↓
DSP Nodes
  ↓
Audio Output / Offline Render
```

### 4.1 Threads

Separate:

1. **Audio thread**
   - No allocations
   - No blocking
   - No database calls
   - No React state
   - No promises
   - No agent calls

2. **Control/UI thread**
   - React controls
   - Parameter edits
   - Save points
   - agent requests
   - preset changes

3. **Render worker**
   - Offline bounce
   - deterministic tests
   - waveform export
   - preview generation

### 4.2 Real-time safety rules

- No heap allocation in audio callback.
- Parameters must be smoothed.
- Feedback must be clamped.
- Output limiter must be mandatory.
- DSP nodes must tolerate sample rate changes.
- Every DSP node must handle silence, denormals, NaN protection.

---

## 5. Core Data Types

### 5.1 Sonic engine state

```ts
export interface SonicEngineState {
  version: string;
  sampleRate: number;
  tempoBpm: number;
  masterGainDb: number;
  voices: SonicVoiceState[];
  effects: SonicEffectState[];
  modulation: ModulationState;
  savePoints: SonicSavePoint[];
  morphPaths: MorphPath[];
}
```

### 5.2 Sonic voice

```ts
export interface SonicVoiceState {
  id: string;
  name: string;
  archetype: "kick" | "snare" | "hat" | "cymbal" | "hybrid" | "pad" | "drone";
  body: BodyModel;
  material: MaterialModel;
  contact: ContactModel;
  gesture: GestureModel;
  position: PositionModel;
  exciter: ExciterModel;
  resonator: ResonatorModel;
  richness: RichnessModel;
  temporal: TemporalModel;
  environment: EnvironmentModel;
  output: OutputModel;
}
```

### 5.3 Percussion event

```ts
export interface PercussionEvent {
  voiceId: string;
  timeBeats: number;
  velocity: number;
  durationBeats?: number;
  gestureOverride?: Partial<GestureModel>;
  contactOverride?: Partial<ContactModel>;
  positionOverride?: Partial<PositionModel>;
  randomSeed?: number;
}
```

For pads/drones, use the same model but with sustained events.

```ts
export interface SustainedEvent {
  voiceId: string;
  startBeats: number;
  endBeats?: number;
  pitchHz?: number;
  intensity: number;
  morphAutomation?: AutomationLane[];
}
```

---

## 6. Audio Graph

### 6.1 Graph model

Use a directed acyclic graph for most processing. Allow carefully controlled feedback nodes only inside explicit DSP modules such as FDN, shimmer, delay, and resonator feedback.

```ts
export interface AudioGraphNode {
  id: string;
  type: string;
  inputs: string[];
  outputs: string[];
  process(block: AudioBlock, context: ProcessContext): void;
}
```

### 6.2 Required graph nodes

Initial nodes:

- `VoiceNode`
- `MixerNode`
- `GainNode`
- `PanNode`
- `FilterNode`
- `DelayNode`
- `FDNReverbNode`
- `ShimmerNode`
- `ModalResonatorNode`
- `RichnessNode`
- `EnvironmentNode`
- `LimiterNode`
- `OutputNode`

---

## 7. DSP Primitives

Implement these first in `packages/sonic-core/src/dsp`.

### 7.1 Parameter smoother

Use linear or one-pole smoothing.

```ts
export class ParameterSmoother {
  setTarget(value: number): void;
  next(): number;
}
```

Use for:

- gain
- feedback
- filter cutoff
- delay time
- pitch amount
- resonator amount
- morph value
- wet/dry mix

### 7.2 Denormal protection

```ts
export function sanitizeSample(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (Math.abs(x) < 1e-20) return 0;
  return x;
}
```

### 7.3 Fractional delay line

Use a circular buffer with cubic interpolation for MVP.

```ts
export class FractionalDelayLine {
  constructor(maxDelaySamples: number);
  write(sample: number): void;
  read(delaySamples: number): number;
}
```

Methods:

- circular buffer
- cubic interpolation
- bounds clamp
- modulated read delay
- optional all-pass interpolation later

### 7.4 Filters

Implement:

- one-pole low-pass
- one-pole high-pass
- biquad low-pass
- biquad high-pass
- biquad band-pass
- shelving filter later

Biquad should use stable coefficient calculation and coefficient smoothing.

### 7.5 All-pass filter

Use for diffusion.

```ts
y[n] = -g*x[n] + x[n-D] + g*y[n-D]
```

Required controls:

- delay
- feedback coefficient
- modulation depth
- stereo variation

### 7.6 Saturation

Implement multiple simple models.

```ts
softClip(x) = tanh(drive * x)
asymmetricClip(x) = tanh(drive * (x + bias)) - tanh(drive * bias)
```

Initial modes:

- soft clip
- asymmetric soft clip
- tape-ish saturation using drive + low-pass damping
- transformer-ish saturation using asymmetric curve + subtle low-frequency emphasis

### 7.7 Noise generators

Implement seeded deterministic noise.

- white
- pink
- brown
- smoothed random
- filtered burst noise

Seeded noise is essential for reproducible renders and agent states.

### 7.8 Ring modulation

Ring modulation should be a subtle richness processor.

```ts
output = input * ((1 - amount) + amount * carrier)
```

Carrier options:

- sine oscillator
- triangle oscillator
- filtered noise
- resonator-derived carrier
- LFO for tremolo-like motion

Use low mix values by default.

### 7.9 Safety limiter

MVP limiter:

- peak detector
- attack/release envelope
- ceiling: -1 dBFS
- optional soft clip after limiter

Mandatory at engine output and in risky feedback effects.

---

## 8. Physical Interaction Kernel

This is the core sound model.

```text
Gesture
  ↓
Contact
  ↓
Exciter
  ↓
Body + Material
  ↓
Resonator
  ↓
Richness
  ↓
Temporal
  ↓
Environment
  ↓
Output
```

---

## 9. Body Module

The Body module represents the resonating object.

```ts
export type BodyType =
  | "membrane"
  | "shell"
  | "plate"
  | "bar"
  | "cavity"
  | "string"
  | "hybrid";

export interface BodyModel {
  type: BodyType;
  size: number;        // 0..1
  mass: number;        // 0..1
  stiffness: number;   // 0..1
  tension: number;     // 0..1
  damping: number;     // 0..1
  resonance: number;   // 0..1
  modeDensity: number; // 0..1
}
```

### Algorithmic mapping

- Membrane: lower fundamental, strong pitch envelope, moderate mode density.
- Shell/cavity: body resonance, lower-mid emphasis.
- Plate: inharmonic modal bank, metallic decay.
- Bar: fewer strong modes, bell/woodblock-like.
- String: harmonic modes, comb/waveguide.
- Hybrid: interpolated body settings for morphing.

---

## 10. Material Module

```ts
export type MaterialType =
  | "skin"
  | "wood"
  | "steel"
  | "brass"
  | "bronze"
  | "glass"
  | "ceramic"
  | "plastic"
  | "stone"
  | "concrete"
  | "bamboo"
  | "carbon"
  | "synthetic";

export interface MaterialModel {
  type: MaterialType;
  hardness: number;
  brightness: number;
  damping: number;
  inharmonicity: number;
  roughness: number;
  nonlinearity: number;
}
```

### Material preset ratios

Use modal ratios as starting points. These are not physically exact; they are musically useful.

```ts
export const materialModalRatios = {
  skin: [1.0, 1.59, 2.14, 2.65, 3.16, 3.50],
  wood: [1.0, 2.01, 3.02, 4.12, 5.19, 6.27],
  steel: [1.0, 1.41, 2.17, 2.89, 3.73, 5.11],
  bronze: [1.0, 1.38, 2.08, 2.92, 4.22, 5.76],
  glass: [1.0, 2.32, 3.88, 5.41, 7.12, 9.31],
  ceramic: [1.0, 1.68, 2.91, 4.37, 6.82, 8.40],
  stone: [1.0, 1.52, 2.44, 3.80, 5.95, 8.10],
  plastic: [1.0, 1.82, 2.70, 3.92, 5.20, 6.90],
  bamboo: [1.0, 2.08, 3.15, 4.22, 5.41, 6.52]
};
```

---

## 11. Contact Module

Contact defines the object or body part touching the instrument.

```ts
export type ContactType =
  | "stick"
  | "rod"
  | "brush"
  | "palm"
  | "finger"
  | "nail"
  | "knuckle"
  | "mallet"
  | "felt_beater"
  | "rubber_beater"
  | "coin"
  | "scraper"
  | "bow";

export interface ContactModel {
  type: ContactType;
  hardness: number;      // attack brightness
  contactArea: number;   // broad vs focused
  friction: number;      // scrape/noise
  bounce: number;        // repeated micro impacts
  contactDurationMs: number;
  damping: number;       // hand damping etc
}
```

### Contact mapping

| Contact | Attack | Noise | Damping | Notes |
|---|---:|---:|---:|---|
| Stick | sharp | low | low | clear transient |
| Brush | soft | high | medium | friction texture |
| Palm | broad | medium | high | excites and damps |
| Finger | soft | medium | medium | intimate transient |
| Mallet | rounded | low | low | strong bloom |
| Coin | sharp | high | low | metallic tick |
| Scraper | continuous | high | variable | path-based |
| Bow | sustained | medium | low | pad/drone compatible |

---

## 12. Gesture Module

```ts
export type GestureType =
  | "hit"
  | "tap"
  | "slap"
  | "roll"
  | "brush"
  | "scrape"
  | "rub"
  | "press"
  | "bounce"
  | "mute"
  | "bow";

export interface GestureModel {
  type: GestureType;
  velocity: number;
  pressure: number;
  durationMs: number;
  angle: number;
  speed: number;
  repetition: number;
}
```

### Gesture algorithms

- Hit/tap: impulse + short noise burst.
- Slap: impulse + broad noise burst + contact damping.
- Roll: repeated micro-events with stochastic timing.
- Brush: filtered noise with envelope and position path.
- Scrape/rub: friction noise + slow modulation + resonator excitation.
- Press/mute: changes damping over time.
- Bow: sustained filtered excitation, pad/drone-compatible.

---

## 13. Position Module

```ts
export interface PositionModel {
  x: number;      // -1..1
  y: number;      // -1..1
  radius: number; // 0 centre, 1 edge
  path?: PositionPath;
}
```

### Position mapping

- Centre: stronger fundamental, less high-frequency complexity.
- Edge: more high modes, brighter, less fundamental.
- Rim/corner: strong transient, inharmonic modes.
- Path: used for brush, scrape, bow, rub.

---

## 14. Exciter Engine

The exciter creates the initial or sustained energy.

### Required exciter types

```ts
export type ExciterType =
  | "impulse"
  | "noise_burst"
  | "filtered_noise"
  | "stick_transient"
  | "brush_noise"
  | "scrape_noise"
  | "friction"
  | "sine_ping"
  | "sustained_bow";
```

### Algorithms

1. **Impulse**
   - one-sample or short-window impulse
   - velocity-scaled

2. **Noise burst**
   - seeded white/pink noise
   - exponential decay envelope
   - filter shaped by contact/material

3. **Stick transient**
   - impulse + very short high-pass filtered click
   - contact hardness controls brightness

4. **Brush**
   - band-passed noise
   - moving filter cutoff
   - continuous envelope

5. **Scrape**
   - noise source with stick-slip modulation
   - random micro-pulses
   - position path controls timbre

6. **Sustained bow**
   - filtered noise + friction oscillator
   - continuous modal excitation
   - designed for pads/drones later

---

## 15. Resonator Engine

The resonator gives the body tone.

### 15.1 Comb resonator

Use for strings, tubes, plucks, simple body tones.

```text
frequency = sampleRate / delaySamples
```

Use fractional delay and damping filter in feedback loop.

```ts
export interface CombResonatorParams {
  frequencyHz: number;
  feedback: number;
  damping: number;
  brightness: number;
}
```

### 15.2 Karplus-Strong

Use for plucked strings and percussive tuned objects.

Algorithm:

1. Fill short delay line with noise burst.
2. Feed back through low-pass filter.
3. Delay length sets pitch.
4. Damping controls decay.

### 15.3 Modal resonator bank

Use bank of band-pass filters.

```ts
export interface ModalMode {
  frequencyHz: number;
  gain: number;
  decaySeconds: number;
  q: number;
  pan: number;
}

export interface ModalResonatorParams {
  modes: ModalMode[];
  inputGain: number;
  outputGain: number;
}
```

Use biquad band-pass filters for MVP.

Mode generation:

```ts
frequency = rootHz * ratio * detune
decay = baseDecay * materialDecayScale * modeDecayScale
gain = modeGain * positionExcitation
```

### 15.4 Inharmonic resonator

Use material modal ratios. Increase inharmonicity by interpolating from harmonic ratios to material ratios.

```ts
ratio = lerp(harmonicRatio, materialRatio, inharmonicity)
```

### 15.5 Harmonic resonator

For tonal pads/drones and musical percussion.

```ts
rootNote + scale + modeCount → frequencies
```

Supported scales:

- chromatic
- major
- minor
- dorian
- pentatonic
- suspended
- harmonic minor

### 15.6 Resonator placement

Support:

```ts
type ResonatorPlacement = "body" | "parallel" | "pre_temporal" | "inside_feedback";
```

MVP: `body` and `parallel`.

Later: `inside_feedback` for shimmer and evolving drones.

---

## 16. Richness Engine

The Richness Engine adds real-world texture.

```ts
export interface RichnessModel {
  saturation: SaturationParams;
  noiseLayers: NoiseLayerParams[];
  ringModulation: RingModulationParams;
  microVariation: MicroVariationParams;
  drift: DriftParams;
  sympathetic: SympatheticResonanceParams;
}
```

### 16.1 Micro-variation

Every event should vary slightly, using deterministic seeded random.

Randomise:

- pitch
- attack
- decay
- brightness
- noise amount
- contact duration
- resonator mode gains
- stereo pan
- damping

### 16.2 Drift

Slow movement over time.

Use:

- LFO
- smoothed random
- random walk with clamp
- tempo-synced drift later

### 16.3 Sympathetic resonance

A voice can excite another voice's resonator at low level.

Example:

```text
Kick hit → snare wire buzz → cymbal shimmer → room bloom
```

MVP:

- send transient energy from one voice to another resonator bus
- scale by coupling amount
- process quietly through target resonator

```ts
interface SympatheticCoupling {
  sourceVoiceId: string;
  targetVoiceId: string;
  amount: number;
  frequencyBias: number;
  decayScale: number;
}
```

---

## 17. Temporal Engine

The Temporal Engine covers delay, reverb, shimmer, freeze, granular, and future pad/drone textures.

```ts
export interface TemporalModel {
  enabled: boolean;
  delay?: DelayParams;
  fdnReverb?: FDNReverbParams;
  shimmer?: ShimmerParams;
  freeze?: FreezeParams;
  granular?: GranularParams;
}
```

### 17.1 Delay

Use fractional delay lines.

Modes:

- mono
- stereo
- ping-pong
- multitap

### 17.2 FDN Reverb

Use an 8-line Feedback Delay Network for MVP.

Components:

- 8 delay lines
- prime-ish delay lengths
- Hadamard or Householder feedback matrix
- per-line damping filters
- modulation per delay line
- stereo output taps

Feedback matrix options:

1. **Hadamard matrix**
   - fast
   - energy-preserving when normalized

2. **Householder matrix**
   - simple
   - stable
   - good diffusion

Householder formula:

```text
H = I - 2vvᵀ / (vᵀv)
```

For MVP, use a fixed normalized Householder or Hadamard matrix.

### 17.3 Shimmer

Shimmer is pitch-shifted feedback reverb.

```text
Input
  ↓
Diffusion
  ↓
FDN
  ↓
Pitch Shifter
  ↓
Filter
  ↓
Feedback
```

Pitch modes:

- octave up
- octave down
- fifth up
- fourth up
- custom semitones
- dual pitch later

Pitch shifter MVP:

- time-domain dual delay read heads
- overlapping Hann windows
- crossfading
- acceptable artifacts because it lives inside reverb feedback

Do not attempt proprietary plugin cloning.

### 17.4 Freeze

Freeze captures and sustains the current buffer.

Implementation:

- set feedback close to 0.999
- reduce input gain to 0
- keep filters and modulation active
- limiter mandatory

### 17.5 Granular future

For pads/drones:

- grain buffer
- grain size
- density
- pitch
- spray
- position jitter
- window shape
- stereo scatter

Do not build in MVP, but keep interfaces open.

---

## 18. Environment Engine

Environment should model spatial context, not only reverb.

```ts
export interface EnvironmentModel {
  roomSize: number;
  earlyReflections: number;
  airAbsorption: number;
  floorReflection: number;
  wallReflection: number;
  micDistance: number;
  stereoWidth: number;
}
```

MVP:

- early reflection taps
- simple stereo widening
- high-frequency damping by distance
- optional room send into FDN

---

## 19. Morph Engine

Morphing must interpolate engine states, not crossfade samples.

### 19.1 Morph target

```ts
export interface MorphTarget {
  id: string;
  name: string;
  state: SonicVoiceState;
}
```

### 19.2 Interpolation

Use typed interpolation:

| Type | Method |
|---|---|
| Continuous numbers | linear / curved interpolation |
| Frequencies | logarithmic interpolation |
| Gains | dB interpolation |
| Enums | weighted transition or threshold |
| Modal ratios | match mode index, interpolate frequency/gain/decay |
| Materials | interpolate material parameters, not labels |
| Contacts | interpolate contact parameters, not labels |

### 19.3 Example kick-to-cymbal path

```text
Kick → Floor Tom → Metal Drum → Gong → Ride → Crash
```

Do not morph directly from kick to cymbal with a single linear map. Use intermediate archetypes.

### 19.4 Morph automation

```ts
export interface MorphAutomation {
  pathId: string;
  startTimeBeats: number;
  durationBeats: number;
  curve: "linear" | "easeIn" | "easeOut" | "sCurve";
}
```

---

## 20. Sonic Space

Sonic Space is a 2D projection of high-dimensional sound state.

It is not the full sound engine.

### 20.1 Sonic map

```ts
export interface SonicMap {
  id: string;
  name: string;
  axes: SonicAxis[];
  savePoints: SonicSavePoint[];
  paths: MorphPath[];
}
```

Example maps:

1. Timbre Map
   - X: warm → bright
   - Y: soft → hard

2. Material Map
   - X: skin/wood → metal/glass
   - Y: damped → resonant

3. Gesture Map
   - X: tap → scrape
   - Y: soft → aggressive

4. Space Map
   - X: dry → huge
   - Y: near → distant

### 20.2 Save points

```ts
export interface SonicSavePoint {
  id: string;
  name: string;
  x: number;
  y: number;
  fullState: SonicVoiceState;
  tags: string[];
  color?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string;
}
```

### 20.3 Highlight behavior

- Save point glows when current state is near.
- Distance measured in projected XY and optionally high-dimensional parameter distance.
- Soft snap when close.
- Hover previews sound.
- Click loads state.
- Drag between points morphs.
- Branching creates child save points.

---

## 21. Agent Interface

Agents must generate validated structured state, not raw DSP code.

### 21.1 Agent action examples

```ts
type SonicAgentAction =
  | { type: "create_voice"; payload: SonicVoiceState }
  | { type: "modify_voice"; voiceId: string; patch: Partial<SonicVoiceState> }
  | { type: "create_save_point"; payload: SonicSavePoint }
  | { type: "create_morph_path"; payload: MorphPath }
  | { type: "generate_variations"; voiceId: string; count: number };
```

### 21.2 Validation rules

All agent outputs must pass schema validation.

Reject:

- feedback > safe limits
- invalid frequencies
- NaN
- excessive gain
- excessive resonance
- unsupported enum values
- missing required fields

### 21.3 Agent design prompt contract

Agents should describe sounds using:

- body
- material
- contact
- gesture
- environment
- temporal effect
- emotional/perceptual intent
- musical role

Example:

```text
Create a dusty wooden kick struck by a felt mallet in a small concrete room.
Return only validated SonicVoiceState JSON.
```

---

## 22. UI Requirements

### 22.1 Keep familiar entry points

Initial visible cards:

- Kick
- Snare
- Hat
- Cymbal

Each opens the same underlying editor with different defaults.

### 22.2 Main editor panels

- Overview
- Body
- Material
- Contact
- Gesture
- Resonator
- Richness
- Temporal
- Environment
- Sonic Space
- Save Points

### 22.3 Controls

Use simple controls first:

- knobs
- sliders
- dropdowns
- XY pad
- save point buttons
- morph path timeline

Advanced controls hidden by default.

---

## 23. Storage

### 23.1 Canvas artifact

```ts
export interface SonicArtifact {
  id: string;
  projectId: string;
  name: string;
  type: "sonic_studio";
  engineState: SonicEngineState;
  renderedAssets: RenderedAudioAsset[];
  createdAt: string;
  updatedAt: string;
  version: number;
}
```

### 23.2 Rendered assets

```ts
export interface RenderedAudioAsset {
  id: string;
  artifactId: string;
  filePath: string;
  format: "wav" | "mp3" | "flac";
  durationSeconds: number;
  sampleRate: number;
  createdAt: string;
  sourceStateHash: string;
}
```

Use `sourceStateHash` to know whether a render is stale.

---

## 24. Testing

### 24.1 Unit tests

Required:

- Parameter smoother
- Fractional delay
- Biquad filters
- All-pass filter
- Noise generators
- Saturation
- Ring modulation
- Modal resonator frequency mapping
- Karplus-Strong stability
- FDN bounded output
- Shimmer feedback stability
- Morph interpolation
- Save point serialization

### 24.2 Offline audio tests

Render:

- impulse
- sine ping
- short noise burst
- kick event
- snare event
- hat event
- cymbal event
- kick-to-cymbal morph
- shimmer tail
- resonator hit

Check:

- no NaN
- no infinity
- output peak below limiter ceiling
- expected non-silent output
- resonator peak near expected frequency
- morph renders continuously without clicks

### 24.3 Golden render tests

Create short deterministic WAV renders for core presets.

Use seeded randomness.

Compare:

- duration
- RMS range
- peak range
- spectral centroid range
- approximate dominant frequency bands

Do not require sample-perfect equality if implementation changes.

---

## 25. Implementation Phases

## Phase 1 — Sonic Core DSP Foundation

Build:

- package structure
- audio block type
- parameter smoother
- seeded random
- noise generators
- fractional delay
- filters
- all-pass filter
- saturation
- ring modulation
- safety limiter
- offline render harness
- unit tests

Acceptance:

- tests pass
- can render a simple impulse through delay/filter/saturation
- no UI required

---

## Phase 2 — Resonator + Exciter MVP

Build:

- exciter engine
- modal resonator
- comb resonator
- Karplus-Strong
- material modal ratios
- body/material/contact/gesture schemas
- one-shot event render

Acceptance:

- can render simple kick/snare/hat/cymbal prototypes
- material changes are audible
- contact changes are audible
- deterministic seed works

---

## Phase 3 — Percussion Kernel MVP

Build:

- shared percussion voice
- Kick/Snare/Hat/Cymbal presets using same kernel
- micro-variation
- richness engine
- basic environment
- offline beat render

Acceptance:

- simple beat renders
- no two seeded varied hits are identical unless variation disabled
- presets sound distinct

---

## Phase 4 — Temporal Engine MVP

Build:

- delay
- FDN reverb
- shimmer
- freeze
- resonator parallel routing
- limiter safety

Acceptance:

- shimmer produces octave bloom
- freeze sustains safely
- FDN remains stable
- resonator + shimmer work together

---

## Phase 5 — Sonic Space + Save Points

Build:

- 2D Sonic Space UI
- save points
- highlight near save point
- load/save point
- branch save point
- morph between two save points

Acceptance:

- current state maps to XY
- save point stores full state
- morph interpolates parameters smoothly
- Canvas artifact persists state

---

## Phase 6 — Canvas Integration

Build:

- Sonic Studio artifact type
- bridge API from Canvas to Sonic Engine
- artifact panel
- rendered audio asset saving
- project persistence
- update history

Acceptance:

- user can create Sonic Studio artifact
- edit sound
- render audio
- save/reopen project
- state restored correctly

---

## Phase 7 — Agent Integration

Build:

- sonic-agent package
- JSON schemas
- validators
- create voice action
- modify voice action
- generate variations action
- save point action

Acceptance:

- agent can generate a valid sound state
- invalid state is rejected
- user can inspect agent-created parameters before applying

---

## Phase 8 — Pads and Drones Expansion

Build later:

- sustained excitation
- bow/friction gestures
- granular engine
- harmonic resonator mode
- drone temporal presets
- pad envelopes
- slow modulation matrix
- spectral freeze later

Acceptance:

- same kernel can produce sustained evolving sound
- pad/drone voices share body/material/contact/environment model

---

## 26. MVP Definition

The first useful MVP is complete when:

1. Sonic Studio exists as packages in the monorepo.
2. `sonic-core` can render deterministic audio offline.
3. Kick, Snare, Hat, Cymbal use one shared kernel.
4. Contact and material changes visibly and audibly affect sound.
5. Shimmer and resonator effects are available.
6. Sonic Space can save/load at least two points.
7. Canvas can store and reopen the Sonic Studio artifact.
8. Tests cover DSP primitives and render stability.

---

## 27. Initial Presets

Create these presets:

### Percussion

- Deep Felt Kick
- Palm Frame Drum
- Dry Stick Snare
- Brush Snare
- Closed Bronze Hat
- Open Air Hat
- Soft Ride Cymbal
- Metallic Bloom Cymbal

### Hybrid

- Kick to Gong
- Wood to Glass
- Snare to Metal Plate
- Hat to Shimmer Dust

### Temporal

- Classic Shimmer
- Glass Cathedral
- Dark Chapel
- Metallic Bloom
- Frozen Harmonic Cloud

### Pads/Drones placeholder

- Bowed Glass Drone
- Ceramic Air Pad
- Wooden Resonance Bed
- Concrete Room Hum

These pad/drone presets may be placeholders until sustained excitation is implemented.

---

## 28. Notes for Codex

Implement one phase at a time.

Do not build the full UI first.

Start with `packages/sonic-core`.

For each phase:

1. Create types.
2. Create pure DSP modules.
3. Add unit tests.
4. Add offline render tests.
5. Add minimal example usage.
6. Only then expose UI or Canvas integration.

Avoid external DSP dependencies unless necessary. If using a dependency, isolate it behind an interface so it can be replaced.

Do not attempt to clone Valhalla, Ableton, Logic, or any commercial plugin. Build a modular physical-temporal sound engine with shimmer and resonator capabilities as reusable configurations.

---

## 29. Suggested First Codex Prompt

```text
Read docs/sonic-studio/spec.md.

Implement Phase 1 only.

Create packages/sonic-core with TypeScript source files for:
- AudioBlock
- ParameterSmoother
- SeededRandom
- Noise generators
- FractionalDelayLine
- OnePoleFilter
- BiquadFilter
- AllPassFilter
- Saturation
- RingModulator
- SafetyLimiter
- OfflineRenderHarness

Add unit tests for each DSP primitive.

Do not implement UI.
Do not implement Canvas integration.
Do not implement later phases yet.
Keep modules small and testable.
```

---

## 30. Long-Term Direction

Sonic Studio should become a physical-temporal sound environment.

The user should not merely choose samples or tweak oscillators. They should design sonic events:

```text
a hand on a drum
a brush across bronze
a mallet on glass
a bow on ceramic
a kick becoming a cymbal
a room resonating in sympathy
a frozen shimmer cloud becoming a drone
```

The system should remain understandable, inspectable, and deterministic enough for serious creation, while allowing agents to explore the high-dimensional sound space on the user's behalf.

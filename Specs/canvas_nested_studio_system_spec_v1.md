# Canvas Nested Studio System Spec v1
_Last updated: 2026-07-03_

## Purpose

This spec defines a **nested Studio system** for Canvas: a way to create bounded sub-canvases with their own small agentic teams, runs, candidate artifacts, and promotion gates. It also formalises a **Domain Studio → Cognitive Studio** pattern so that a parent domain studio (e.g. Cell Mitosis Studio) can invoke a nested cognitive studio (e.g. Socratic Studio) to go deep on a particular question without polluting the parent exploration.

The design goal is to let Canvas support:

- rich exploratory work rather than only chat or static artifacts
- reusable studio playbooks and reusable cognitive modes
- bounded experimentation with clean promotion back to the main graph
- nested inquiry where specialist sub-teams can work in parallel or as deep-dive branches
- durable state, history, provenance, and reversibility

---

# 1. Core concept

## 1.1 What a Studio is

A **Studio** is a bounded exploratory sub-canvas with:

- a **brief / mission**
- a **playbook** (operating pattern)
- a **team configuration**
- a **working artifact graph**
- **runs**, **steps**, and **events**
- **candidate artifacts** produced inside the studio
- a **promotion boundary** that determines what flows back to the parent canvas or parent studio

A Studio is not just a folder and not just an agent card. It is a **composite artifact with a runtime**.

---

# 2. Why nested studios exist

Nested studios are used when a sub-problem needs its own:

- mission and focus
- team composition
- run history
- critique loop
- tool permissions
- candidate artifacts
- promotion decisions

### Rule of thumb

> Nest a Studio when a branch of work needs its own operating loop, not merely its own folder.

---

# 3. Two classes of studios

The system distinguishes between **Domain Studios** and **Cognitive Studios**.

## 3.1 Domain Studios

A **Domain Studio** owns the subject matter and the broader understanding scheme or work product.

Examples:
- Cell Mitosis Studio
- Melbourne Feasibility Studio
- Sonic Synthesis Studio
- Theology Study Studio
- Architecture Precedent Studio

Domain Studios usually own:
- the main brief
- the canonical artifact set for the exploration
- the final learning path / dossier / design output
- the decision about what gets promoted upward

## 3.2 Cognitive Studios

A **Cognitive Studio** owns a mode of thinking rather than a subject domain. It is invoked by a parent studio to apply a specific kind of reasoning to a bounded question or artifact set.

Examples:
- Socratic Studio
- Critique Studio
- Debate Studio
- Teach Studio
- Compare Studio
- Reflection Studio
- Counterexample Studio

Cognitive Studios usually own:
- a focal question or challenge
- a constrained artifact packet from the parent
- a specific reasoning playbook
- synthesis and recommendations back to the parent

---

# 4. Example nesting pattern

## Parent Domain Studio
**Cell Mitosis Studio**

Mission:
- Build a rich understanding scheme for mitosis and cell division.
- Generate process timelines, stage cards, glossary cards, references, animations, comparisons, and question paths.

## Child Cognitive Studio
**Socratic Studio: Why metaphase alignment matters**

Mission:
- Interrogate one hard biological question deeply.
- Produce a better explanation, question ladder, misconception corrections, and suggested updates for the parent mitosis artifacts.

This gives Canvas a clean pattern:

> **Domain Studio owns the subject. Cognitive Studio performs a bounded deep dive on a question inside that subject.**

---

# 5. Product goals

The nested studio system should allow Canvas to:

1. create **bounded sub-agencies** inside a larger exploration
2. apply different **thinking modes** to the same artifact graph
3. preserve **local run history** without cluttering the parent
4. generate **candidate artifacts** before promotion
5. support **parallel specialist workstreams**
6. allow **playbook reuse** across domains
7. turn repeated successful patterns into reusable **templates, generators, and primitives**

---

# 6. Non-goals

This system is **not** intended to:

- create arbitrary deep hierarchy with no clear purpose
- replace the parent canvas with a tree of opaque black boxes
- allow child studios to freely mutate parent artifacts without review
- turn every small question into a nested studio
- hardcode one domain or one pedagogy into Canvas

---

# 7. Design principles

## 7.1 Studio as composite artifact + runtime
A Studio is a first-class artifact that also has a runtime layer.

## 7.2 Parent/child studios are linked by promotion, not uncontrolled mutation
Child outputs should return to the parent via **promotion** or **patch proposals**, not direct hidden mutation.

## 7.3 Candidate-first, canonical-second
Artifacts generated inside a studio should generally begin as **candidate artifacts** until reviewed and promoted.

## 7.4 Thinking modes are first-class
Cognitive studios are a way to implement thinking modes (Socratic, Critique, Teach, Reflect, Compare, etc.) as reusable behaviors over shared state.

## 7.5 Nest only when bounded autonomy is useful
Nested studios should exist because a sub-problem benefits from its own operating loop, not because hierarchy is fashionable.

## 7.6 Domain grounding must remain explicit
A cognitive studio nested inside a domain studio should always receive a structured packet of domain context rather than reasoning in the abstract.

---

# 8. Studio lifecycle states

Each studio has a lifecycle state.

Suggested states:

- `seeded` — studio exists but has not done meaningful work
- `gathering` — collecting references / context / artifacts
- `framing` — defining the question or scheme
- `generating` — producing candidate artifacts
- `critiquing` — evaluating outputs and surfacing gaps
- `curating` — selecting and shaping artifacts
- `ready_for_promotion` — child outputs are ready for parent review
- `published_to_parent` — selected outputs promoted upward
- `dormant` — studio preserved but inactive
- `reopened` — resumed after dormancy
- `archived` — closed and not expected to continue

---

# 9. Core ontology

The nested studio system extends the broader Canvas artifact ontology with a small set of core types.

## 9.1 Core entities

- `Studio`
- `StudioRun`
- `StudioStep`
- `StudioTeamMember`
- `CandidateArtifact`
- `PromotionDecision`
- `PatchProposal`
- `ContextPacket`
- `Playbook`
- `GeneratorInvocation`
- `CritiqueNote`

## 9.2 Relationship sketch

- A **Studio** owns many **StudioRuns**
- A **StudioRun** contains many **StudioSteps**
- A **Studio** has a **team configuration**
- A **Studio** contains or references **artifacts**
- A **Studio** can contain child **Studios**
- A child **Studio** is linked to its parent by an **invocation step**
- A child **Studio** returns outputs via **PromotionDecision** and/or **PatchProposal**

---

# 10. Studio object model

## 10.1 Studio

```ts
type Studio = {
  id: string
  title: string
  description?: string
  studio_kind: "domain" | "cognitive" | "hybrid"
  playbook_id: string
  parent_studio_id?: string
  parent_artifact_id?: string
  state: StudioState
  brief_artifact_id?: string
  team_config: StudioTeamMemberRef[]
  working_artifact_ids: string[]
  candidate_artifact_ids: string[]
  promoted_artifact_ids: string[]
  child_studio_ids: string[]
  run_ids: string[]
  settings?: StudioSettings
  created_at: string
  updated_at: string
}
```

## 10.2 StudioState

```ts
type StudioState =
  | "seeded"
  | "gathering"
  | "framing"
  | "generating"
  | "critiquing"
  | "curating"
  | "ready_for_promotion"
  | "published_to_parent"
  | "dormant"
  | "reopened"
  | "archived"
```

## 10.3 StudioSettings

```ts
type StudioSettings = {
  visibility?: "private" | "shared" | "published"
  allow_child_studios?: boolean
  max_child_depth?: number
  auto_create_candidate_artifacts?: boolean
  default_promotion_mode?: "manual" | "proposal_only" | "auto_with_review"
  tool_policy_id?: string
  run_budget_policy_id?: string
}
```

---

# 11. Runs, steps, and events

## 11.1 StudioRun

A run is one bounded attempt to advance the studio mission.

```ts
type StudioRun = {
  id: string
  studio_id: string
  title: string
  goal: string
  status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelled"
  input_artifact_ids: string[]
  output_artifact_ids: string[]
  step_ids: string[]
  event_ids: string[]
  started_at?: string
  ended_at?: string
  summary?: string
}
```

## 11.2 StudioStep

A step is a unit of work inside a run.

```ts
type StudioStep = {
  id: string
  run_id: string
  title: string
  performer_kind: "human" | "agent" | "generator" | "studio"
  performer_ref?: string
  goal?: string
  input_artifact_ids?: string[]
  output_artifact_ids?: string[]
  status: "pending" | "running" | "completed" | "failed" | "skipped"
  child_studio_id?: string
  created_at: string
  updated_at: string
}
```

### Important pattern: `performer_kind = "studio"`
This is how a parent studio invokes a child studio as a **composite step**.

---

# 12. Team model

A studio owns a **team configuration**. Team members are usually roles/capabilities rather than permanent person-like agents.

## 12.1 StudioTeamMember

```ts
type StudioTeamMember = {
  id: string
  role_key: string
  title: string
  instructions?: string
  allowed_tools?: string[]
  output_artifact_types?: string[]
  review_responsibilities?: string[]
  is_required?: boolean
}
```

## 12.2 Example role library

### Domain-oriented roles
- Researcher
- Explainer
- Visualizer
- Synthesizer
- Simulation Architect

### Cognitive roles
- Socratic Questioner
- Challenger / Critic
- Teacher
- Comparator
- Reflector
- Counterexample Hunter

---

# 13. Context packets

When a parent studio invokes a child studio, it should pass a **ContextPacket** rather than expecting the child to infer context from the entire parent graph.

## 13.1 ContextPacket

```ts
type ContextPacket = {
  id: string
  source_studio_id: string
  target_studio_id?: string
  title: string
  focal_question?: string
  artifact_ids: string[]
  summary?: string
  constraints?: string[]
  expected_outputs?: string[]
  created_at: string
}
```

## Why this matters
A cognitive studio should not become detached from the domain. It needs a bounded packet containing:

- the focal question
- the relevant artifacts
- any critical source material
- audience/depth constraints
- the output contract expected by the parent

---

# 14. Candidate artifacts

Artifacts generated inside a studio should normally begin as **candidates**.

## 14.1 CandidateArtifact wrapper

```ts
type CandidateArtifact = {
  id: string
  studio_id: string
  underlying_artifact_id: string
  status: "draft" | "under_review" | "approved" | "rejected" | "promoted"
  provenance_run_id?: string
  provenance_step_id?: string
  notes?: string
}
```

Candidate artifacts allow a child studio to experiment freely without automatically polluting the parent’s canonical graph.

---

# 15. Promotion model

Promotion is the mechanism by which child studio outputs flow back into the parent.

## 15.1 PromotionDecision

```ts
type PromotionDecision = {
  id: string
  source_studio_id: string
  target_studio_id?: string
  target_artifact_id?: string
  candidate_artifact_id: string
  action: "promote_new" | "attach_as_reference" | "replace_existing" | "patch_existing"
  status: "proposed" | "approved" | "rejected" | "applied"
  rationale?: string
  approved_by?: string
  created_at: string
  applied_at?: string
}
```

## 15.2 PatchProposal

A child studio may want to propose a change to an existing parent artifact rather than create a brand new artifact.

```ts
type PatchProposal = {
  id: string
  source_studio_id: string
  target_artifact_id: string
  patch_type: "append_section" | "replace_section" | "update_fields" | "annotate" | "link_artifact"
  payload: Record<string, unknown>
  rationale?: string
  status: "proposed" | "approved" | "rejected" | "applied"
}
```

---

# 16. Nested studio invocation contract

A nested studio should be created through a formal invocation step.

## 16.1 Invocation payload

```ts
type ChildStudioInvocation = {
  parent_studio_id: string
  child_playbook_id: string
  title: string
  studio_kind: "cognitive" | "domain" | "hybrid"
  focal_question: string
  context_packet_id: string
  expected_outputs: string[]
  parent_step_id: string
}
```

## 16.2 Invocation flow

1. Parent studio identifies a question or sub-problem that merits a child studio.
2. Parent creates a **StudioStep** with `performer_kind = "studio"`.
3. Parent creates a **ContextPacket**.
4. Child studio is instantiated from the chosen playbook.
5. Child runs using the context packet and its own team/playbook.
6. Child produces candidate artifacts, critiques, and patch proposals.
7. Parent reviews and promotes selected outputs.

---

# 17. Studio playbooks

Studios are instantiated from **playbooks**. A playbook is a reusable operating template.

## 17.1 Playbook model

```ts
type Playbook = {
  id: string
  key: string
  title: string
  studio_kind: "domain" | "cognitive" | "hybrid"
  description?: string
  recommended_roles?: string[]
  suggested_steps?: PlaybookStepTemplate[]
  default_output_types?: string[]
  review_gates?: string[]
}
```

## 17.2 Examples

### Domain playbooks
- Learning Studio
- Process Explorer Studio
- Research Dossier Studio
- Feasibility Intelligence Studio
- Design Critique Studio

### Cognitive playbooks
- Socratic Inquiry Studio
- Critique Studio
- Debate Studio
- Compare Studio
- Teaching Studio
- Reflection Studio

---

# 18. Studio block library

The nested studio system becomes much more valuable when studios are assembled from reusable blocks.

## 18.1 Block classes

### Artifact blocks
Reusable artifact schemas:
- `process_timeline`
- `stage_card`
- `question_set`
- `misconception_card`
- `reference_packet`
- `comparison_artifact`
- `glossary_card`
- `critique_note`
- `learning_path`
- `animation_sequence`
- `visual_spec`
- `hypothesis_card`
- `objection_card`
- `synthesis_note`

### Generator blocks
Reusable transforms:
- generate stage cards from a timeline
- derive questions from an artifact
- compare two process artifacts
- extract misconceptions from an explanation
- storyboard animation from a process
- critique for missing causal links

### Critique blocks
Reusable quality checks:
- source grounding review
- missing causal link review
- beginner clarity review
- misconception risk review
- contradiction review
- overclaim review

### UI pattern blocks
Reusable interaction patterns:
- timeline + detail
- compare branches
- question ladder
- claim / objection / reply
- candidate review panel
- promotion queue
- child studio card summary

### Role blocks
Reusable team roles:
- Researcher
- Explainer
- Visualizer
- Socratic Questioner
- Critic
- Teacher
- Synthesizer

---

# 19. Nesting rules and constraints

Nested studios are useful, but hierarchy bloat is dangerous. The system should impose some guardrails.

## 19.1 Suggested rules

| Rule | Recommendation |
| --- | --- |
| Maximum nesting depth | 2–3 levels |
| Each child studio requires | clear mission, owner, expected outputs |
| Parent sees child as | a composite artifact / card with summary |
| Child → parent changes | via promotion or patch proposals |
| Parent can inspect child | state, summary, outputs, open issues, run history |
| Child access to parent | read selected packet, not arbitrary free mutation |
| Cross-child linking | allowed but explicit and typed |

## 19.2 When to use a child studio
Create a child studio when the sub-problem:

- materially affects the parent’s understanding scheme or output
- needs multiple rounds of challenge/refinement
- is likely to produce reusable artifacts
- benefits from a separate run history
- requires different specialist roles or critique rules

## 19.3 When *not* to use a child studio
Do **not** create a child studio when:

- the question is tiny and can be answered in one step
- no new artifacts are expected
- no separate critique loop is needed
- the work is just a local note or annotation

---

# 20. Example: Cellular Studio invoking a Socratic Studio

This is the canonical worked example.

## 20.1 Parent domain studio
**Cell Mitosis Studio**

Parent mission:
- build a deep learning scheme for mitosis
- produce process timeline, stage cards, animations, references, glossary, question sets, failure modes, and comparison to meiosis

### Existing parent artifacts
- `process_timeline: mitosis_v1`
- `stage_card: metaphase_v2`
- `stage_card: anaphase_v1`
- `reference_packet: mitosis_core_sources`
- `glossary_card: chromosome`
- `glossary_card: chromatid`
- `critique_note: metaphase explanation still shallow`

## 20.2 Parent identifies a deep question
The parent decides it needs a deeper answer to:

> **Why must chromosomes align at metaphase before anaphase begins?**

The parent does not just ask an inline question. It creates a child studio.

## 20.3 Child cognitive studio
**Socratic Studio: Why metaphase alignment matters**

### Child mission
Produce a deeper explanation of the purpose, logic, and failure modes of metaphase alignment suitable for inclusion in the parent Cell Mitosis Studio.

### Context packet sent from parent
- `process_timeline: mitosis_v1`
- `stage_card: metaphase_v2`
- `stage_card: anaphase_v1`
- `reference_packet: mitosis_core_sources`
- `critique_note: metaphase explanation still shallow`

### Child team
- Socratic Questioner
- Explainer / Responder
- Challenger / Critic
- Synthesizer

### Child outputs expected
- `synthesis_note`
- `question_set`
- `misconception_card`
- `patch_proposal` for `stage_card: metaphase_v2`

## 20.4 Likely child outputs

### 1. Synthesis note
A refined explanation along the lines of:

> Metaphase alignment is not merely visual order. It is the visible sign that each duplicated chromosome has likely achieved correct bipolar attachment to the spindle. This matters because anaphase irreversibly separates sister chromatids; if even one chromosome is misattached, daughter cells can inherit unequal genetic material. The checkpoint therefore functions as a quality-control gate before irreversible segregation.

### 2. Question ladder
- What does metaphase look like?
- Why do chromosomes align at the equator?
- How does alignment relate to spindle attachment?
- Why is bipolar attachment necessary?
- What errors occur if anaphase begins too early?
- Why is a checkpoint needed at this stage?

### 3. Misconception card
**Misconception:** chromosomes line up simply because that is the next stage of mitosis.  
**Correction:** alignment is functionally tied to correct spindle attachment and quality control before irreversible separation.

### 4. Patch proposal
Update the parent `stage_card: metaphase_v2` with:
- deeper “why it matters” section
- explicit checkpoint/failure mode note
- link to the misconception card

## 20.5 Promotion back to parent
The parent studio reviews the outputs and decides to:

- patch `stage_card: metaphase_v2`
- attach the `question_set`
- add the `misconception_card`
- keep some rough exploratory notes only inside the child studio

---

# 21. UI model

## 21.1 Parent studio view
The parent should show a child studio as a **collapsed composite card** unless the user explicitly opens it.

Example card:

```text
Socratic Deep Dive: Why metaphase alignment matters
Status: Completed
Outputs ready: 4
Promoted: 3
Open issues: 1
Main finding: metaphase alignment is a quality-control state tied to correct bipolar attachment, not just visual order.
[Open Studio] [Review Outputs]
```

## 21.2 Child studio view
When opened, the child studio should have its own canvas / studio surface with:

- child brief
- context packet summary
- run history
- candidate artifacts
- promotion queue
- critique notes
- final synthesis

## 21.3 Parent/child navigation
The parent should show:
- child title
- state
- last run
- promoted outputs
- open risks / unresolved questions

The child should show:
- parent link
- invocation reason
- context packet
- target outputs
- promotion history

---

# 22. Permissions and tool boundaries

A child studio may need a different tool policy than the parent.

Examples:
- a Visual Studio might be allowed image generation tools
- a Research Studio might be allowed broad search and source extraction
- a Socratic Studio might be text-first and disallow image generation
- a domain studio might allow all of the above but keep child policies tighter

The nested studio system should support tool policies at the studio level, not just globally.

---

# 23. Provenance and history

Everything in a nested studio system should be traceable.

Track:
- which parent step invoked the child studio
- which context packet the child used
- which runs produced which candidate artifacts
- which promotion decisions changed the parent
- which patch proposals were accepted or rejected

This is important for:
- trust
- reversibility
- debugging
- explanation
- learning which studio patterns are actually useful

---

# 24. Value model

Nested studios are not just an interaction trick. They should become a **value engine**.

A good child studio can produce value at multiple levels:

## 24.1 Topic-specific outputs
Example:
- metaphase question ladder
- mitosis misconception card
- animation notes for cell division

## 24.2 Reusable domain outputs
Example:
- a stronger `stage_card` pattern for biological processes
- a better “what changed / why it matters / what goes wrong” card structure

## 24.3 Reusable cognitive outputs
Example:
- a refined Socratic question ladder pattern
- a reusable “deep explanation” synthesis structure

## 24.4 Reusable playbook improvements
Example:
- “for process explainers, the Socratic deep dive should happen after first-pass stage cards but before animation generation”

## 24.5 Reusable product primitives
If the same pattern repeats, it may harden into:
- first-class `question_ladder`
- first-class `state_diff_card`
- first-class `promotion_review_panel`

This is one of the strongest reasons to build studios at all.

---

# 25. Studio-as-step pattern

The cleanest way to embed nested studios into the broader Canvas model is to treat them as **steps**.

## 25.1 Principle
A path or run can contain steps whose performer is:

- a human
- an agent
- a generator
- **another studio**

That means nested studios are not a separate strange subsystem. They are a natural extension of the run/step model.

---

# 26. Suggested first implementation scope

A practical v1 should stay narrow.

## 26.1 v1 scope
Implement:

1. `Studio`
2. `StudioRun`
3. `StudioStep`
4. `CandidateArtifact`
5. `PromotionDecision`
6. `PatchProposal`
7. `ContextPacket`
8. `Playbook`
9. one **Domain Studio** example
10. one **Cognitive Studio** example
11. parent → child invocation flow
12. collapsed child studio card in UI
13. review/promotion UI

## 26.2 Recommended example pair for v1
- **Domain Studio:** Cell Mitosis Studio
- **Cognitive Studio:** Socratic Inquiry Studio

This pair is a strong test because it exercises:
- process explanation
- source grounding
- question generation
- misconception handling
- child → parent patching

---

# 27. Future directions

Once the nested studio model is working, Canvas can expand to support:

- **parallel child studios** (e.g. Socratic + Visual + Research)
- **studio orchestration policies**
- **playbook analytics** (“which child studios improved outcomes?”)
- **studio templates** shared across projects
- **cross-domain cognitive studio reuse**
- **multi-branch promotion review**
- **studio performance metrics**
- **automatic recommendations** (“this question looks deep enough to spawn a Socratic Studio”)

---

# 28. Summary

The nested studio system gives Canvas a disciplined way to do deep exploratory work.

## Core idea
- A **Domain Studio** owns the subject and the final scheme.
- A **Cognitive Studio** is invoked as a bounded nested workstream to apply a particular kind of thinking to a specific question or artifact packet.
- Child outputs remain local until promoted back to the parent through explicit decisions or patch proposals.

## In one line

> **Nested studios let Canvas decompose an exploration into bounded specialist sub-agencies while preserving shared context, local autonomy, explicit provenance, and clean promotion back into the main artifact graph.**

---

# 29. Recommended next spec

After this document, the next useful companion spec would be:

## **Canvas Studio Block Library Spec**
to define:
- reusable artifact blocks
- generator blocks
- critique blocks
- role blocks
- UI patterns
- domain kernels and cognitive kernels

That would turn the nested studio model from an architecture pattern into a reusable product system.

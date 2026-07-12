# ADR 0004: Artifact type registration and domain boundaries

Status: Accepted for Canvas Core Phase 1

## Context

Default capabilities are currently selected by an expanding conditional in the artifact repository. Future IFC, Sonic, Flow, agent, and runtime systems must share artifact contracts without moving domain engines into the generic core.

## Decision

Artifact type registration is deterministic declarative data composed at module load. A registration may provide a type name, content validator/schema, default capabilities, supported view types, and inert metadata.

The registry must not hold database clients, React state, service instances, provider clients, Web Audio objects, Three.js objects, or mutable runtime state. Capabilities describe supported actions and do not grant actor permission.

The shared core owns identity, generic events, relationships, views, lifecycle contracts, and registration. Domain packages own IFC geometry/indexing, audio scheduling and nodes, Flow-specific documents/layout, Three.js scene state, and LLM provider implementations. High-volume IFC elements are not automatically generic artifacts.

## Alternatives considered

- Keep repository type conditionals: rejected because persistence becomes the type-policy owner.
- Mutable service-locator registry: rejected because it hides dependencies and prevents standalone reuse.
- Put all domain entities into the artifact table: rejected because volume and lifecycle differ materially.

## Consequences

Repositories request defaults and validation from a narrow registry. Standalone clients can reuse artifact contracts without importing Canvas UI. Authorization remains a separate concern.

## Migration implications

Phase C moves existing capability defaults without changing response values. Domain-specific persistence migration is deferred.

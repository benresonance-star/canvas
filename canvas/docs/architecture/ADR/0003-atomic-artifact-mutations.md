# ADR 0003: Atomic artifact mutations and history

Status: Accepted for Canvas Core Phase 1

## Context

The existing `artifactService` already wraps core lifecycle changes and artifact/canvas event writes in PostgreSQL transactions. Relationship mutations are still orchestrated by the HTTP route, and repository updates can accept lifecycle state fields directly.

## Decision

Generic artifact commands are validated and orchestrated by the existing application service. Repositories remain database-focused and accept an injected transaction client. Artifact mutation, relationship mutation when applicable, artifact-event append, and general canvas audit append commit or roll back together.

State transitions use the transition command and cannot be performed through general update routes. Applicable mutations use optimistic expected-version checks. Filesystem and provider side effects are documented external boundaries and are not described as part of a PostgreSQL transaction.

## Alternatives considered

- Add a second artifact application service: rejected as duplicate architecture.
- Append events after route success: rejected because mutation and history can diverge.
- Full event sourcing: rejected as out of scope.
- Treat filesystem writes as transactional: rejected because PostgreSQL cannot roll them back.

## Consequences

Routes become adapters. Existing response shapes remain compatible. Restore, relationship removal, and expected-version conflicts require explicit commands and tests.

## Migration implications

Bounded-domain repositories that directly write artifacts are inventoried but are not mechanically migrated in Phase 1. Only generic lifecycle operations in scope must cross the application boundary.

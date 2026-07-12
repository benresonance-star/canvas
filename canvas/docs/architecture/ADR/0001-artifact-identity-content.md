# ADR 0001: Artifact identity and content ownership

Status: Accepted for Canvas Core Phase 1

## Context

Canvas cards combine presentation, folder aliases, cached content, and references to durable artifact rows. Folder-backed notes may be created while artifact ingest is unavailable, so a card can temporarily have no `artifactRef`. File paths and card IDs can also change independently of durable content identity.

## Decision

`artifact.id` is immutable canonical artifact identity. Canvas card IDs, staging IDs, filenames, relative paths, sync keys, and content hashes are aliases or evidence and must not be promoted to artifact identity.

The generic artifact row owns identity and common metadata. A file-backed `user_note` body remains owned by the linked file while that file is present; project-document content remains the established fallback when the file is unavailable. Artifact-view storage contains no note body.

Only notes with one existing, project-compatible artifact reference are eligible for canonical view projection. Unresolved or ambiguous notes remain on the legacy placement path.

## Alternatives considered

- Use `card.id` as artifact identity: rejected because cards are view instances.
- Use normalized file paths: rejected because paths are mutable aliases.
- Create artifacts automatically during view backfill: rejected because ambiguous identity must not be invented silently.
- Move note bodies into the generic artifact row: rejected because it would break current folder ownership and offline behavior.

## Consequences

Backfill requires an identity audit. Pending-ingest notes remain usable but legacy-only until ingest resolves. Rename and restore operations preserve artifact identity while updating aliases. Filesystem writes remain outside PostgreSQL transactions and require explicit ordering and compensation.

## Migration implications

The Phase 1 backfill reports missing, absent, multiple, and cross-project references without mutating them. Canonical reads must fall back to legacy placement for ineligible notes.

# Canvas App — Data Architecture Spec

This spec describes how project, resource, note, link, and canvas data must be stored and
managed. It is prescriptive: where it says MUST, do exactly that. Where it says MUST NOT,
treat it as a hard rule. Do not introduce alternatives or "clever" shortcuts.

---

## 1. Core principles (read first)

1. **Postgres is the source of truth for structure.** Projects, resources, notes, URL links,
   clusters, their relationships, and canvas layout all live in Postgres.
2. **The filesystem is the source of truth for content blobs only** (resource bodies, note
   bodies, `.md` chat files). The filesystem is referenced by ID, never trusted for structure.
   Project-specific blobs (notes, chats) live in the project's own folder; shared resource
   blobs live in a separate shared store (§3).
3. **Identity is a UUID, never a file path.** Paths can change; IDs never do.
4. **Resources are shared; notes and URL links are project-specific.**
   - A *resource* is a first-class shared thing: many projects may reference it; editing it
     updates it everywhere. Projects reference resources, they do not own the bytes.
   - A *note* and a *URL link* belong to exactly one project and are NEVER shared.
5. **Content is never duplicated implicitly.** Resource duplication happens only via the
   explicit Detach action (§7). Editing a shared resource updates it everywhere.
6. **Nothing is hard-deleted, and a resource is only purged when nothing references it.**
7. **Every write is tagged with its `project_id`.** Stale writes are rejected.

If a requirement ever seems to conflict with these principles, the principles win.

---

## 2. Identifiers

- Every project, resource, note, URL link, and cluster MUST get a `UUIDv7` at creation time.
- The ID is generated **once** and is **immutable**. It is never reused, even after delete.
- File paths MUST NOT be used as identity anywhere in the code or database.
- The database stores the mapping from `id` -> current file path.

---

## 3. Filesystem layout

There are exactly two storage locations:

1. **The project's own folder** — the folder the user pointed the project at
   (`projects.root_path`). ALL project-specific blobs live here: note bodies and chat
   transcripts. The project is self-contained in this folder.
2. **The shared resource store** — a single managed location for shared resource blobs.
   This is NOT inside any project's folder.

```
<project_root>/                  # = projects.root_path (the folder the user chose)
  notes/
    <note_id>.md                 # note body (project-specific)
  chats/
    <chat_id>.md                 # chat transcript (project-specific)
  project.json                   # optional cache of project metadata (NOT authoritative)

<shared_store>/
  resources/
    <resource_id>.<ext>          # SHARED content blob — one file per resource
```

Rules:

- Note and chat blobs live in their project's `root_path` folder and MUST NOT be shared
  between projects. URL links and clusters have no blob — they are DB-only.
- A resource blob lives in the shared store exactly once, regardless of how many projects
  use it. Resource blobs MUST NOT live inside a project folder — a shared blob in one
  project's folder would be lost to other projects if that project is moved or deleted.
  This is the single, deliberate exception to "project-specific data lives in the project
  folder": resources are shared, so they cannot belong to any one project's folder.
- `notes.file_path` and `chats.file_path` are stored **relative to the project's
  `root_path`** (e.g. `notes/<note_id>.md`), so moving the project folder does not break
  the references as long as `root_path` is updated.
- The DB row is authoritative. A file with no matching DB row is an orphan (see §9).

---

## 4. Database schema

Use these tables. Types are PostgreSQL. Adjust column lengths only if needed.

```sql
CREATE TABLE projects (
  id           UUID PRIMARY KEY,            -- UUIDv7
  name         TEXT NOT NULL,
  root_path    TEXT NOT NULL,               -- the folder the user pointed this project at;
                                            -- holds this project's notes/ and chats/ blobs
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,                 -- NULL = active
  version      BIGINT NOT NULL DEFAULT 1
);

-- Shared, mutable content. Owns its own bytes and lifecycle. NOT owned by a project.
CREATE TABLE resources (
  id           UUID PRIMARY KEY,            -- UUIDv7, stable resource identity
  kind         TEXT NOT NULL,               -- e.g. 'text', 'image', 'primitive'
  file_path    TEXT NOT NULL,               -- relative to <storage_root>/resources/
  content_hash TEXT NOT NULL,               -- sha256 of file bytes; updated on every edit
  version      BIGINT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- Many-to-many: which projects reference which resources. This IS the sharing mechanism.
CREATE TABLE project_resources (
  project_id   UUID NOT NULL REFERENCES projects(id),
  resource_id  UUID NOT NULL REFERENCES resources(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, resource_id)
);

-- Project-specific. Never shared. Body is a .md file under the project dir.
CREATE TABLE notes (
  id           UUID PRIMARY KEY,            -- UUIDv7
  project_id   UUID NOT NULL REFERENCES projects(id),
  title        TEXT,
  file_path    TEXT NOT NULL,               -- relative to project root_path
  version      BIGINT NOT NULL DEFAULT 1,   -- notes are editable -> concurrency
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- Relational primitive links: a note points at a resource WITHIN THE SAME PROJECT.
-- This table is the single source of truth for note->artifact connectors.
CREATE TABLE note_links (
  note_id      UUID NOT NULL REFERENCES notes(id),
  resource_id  UUID NOT NULL REFERENCES resources(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, resource_id)
);

-- Project-specific. Never shared. No file — stored inline.
CREATE TABLE url_links (
  id           UUID PRIMARY KEY,            -- UUIDv7
  project_id   UUID NOT NULL REFERENCES projects(id),
  url          TEXT NOT NULL,
  title        TEXT,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE clusters (
  id           UUID PRIMARY KEY,            -- UUIDv7
  project_id   UUID NOT NULL REFERENCES projects(id),
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

-- Clusters group resources WITHIN a project.
CREATE TABLE cluster_members (
  cluster_id   UUID NOT NULL REFERENCES clusters(id),
  resource_id  UUID NOT NULL REFERENCES resources(id),
  PRIMARY KEY (cluster_id, resource_id)
);

-- One row per project. Holds the persistent canvas layout (placement is per-project).
CREATE TABLE canvas_state (
  project_id   UUID PRIMARY KEY REFERENCES projects(id),
  layout       JSONB NOT NULL,              -- placed nodes + positions (see §5)
  viewport     JSONB NOT NULL,              -- pan + zoom (see §5)
  version      BIGINT NOT NULL DEFAULT 1,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chats (
  id           UUID PRIMARY KEY,            -- UUIDv7
  project_id   UUID NOT NULL REFERENCES projects(id),
  agent_id     TEXT NOT NULL,
  file_path    TEXT NOT NULL,               -- relative to project root_path
  ordering     INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX ON project_resources (resource_id);   -- reference counting (§9)
CREATE INDEX ON project_resources (project_id);
CREATE INDEX ON notes      (project_id) WHERE deleted_at IS NULL;
CREATE INDEX ON url_links  (project_id) WHERE deleted_at IS NULL;
CREATE INDEX ON note_links (note_id);
CREATE INDEX ON note_links (resource_id);
CREATE INDEX ON clusters   (project_id) WHERE deleted_at IS NULL;
CREATE INDEX ON chats      (project_id) WHERE deleted_at IS NULL;
```

Foreign keys MUST stay enforced. Do not disable them to "make a feature work".

**Integrity rule for note links:** a row in `note_links` is only valid if `note.project_id`
equals the `project_id` that references `resource_id` in `project_resources`. In plain terms:
**a note may only link to a resource its own project references.** Enforce this in the
create-link endpoint.

---

## 5. Canvas state

There are two kinds of state. Treat them differently.

**Content vs placement — the key separation:**
- A resource's **content** is shared (one body, in `resources`).
- **Placement** (which nodes are on the canvas, and where) is always per-project, in
  `canvas_state`. The same resource can sit at different positions on different canvases.

**Placeable node kinds:** `resource`, `note`, `url`. A placed node is identified by its
`kind` plus its `id`. Notes and URL links, being project-specific, only ever appear on
their own project's canvas.

**Connectors (note -> resource) are NOT stored in layout.** They are rendered from the
`note_links` table, which is their single source of truth.

`layout` JSONB shape:
```json
{
  "placed": [
    { "kind": "resource", "id": "<uuid>", "x": 120, "y": 80,  "w": 240, "h": 160, "cluster_id": null },
    { "kind": "note",     "id": "<uuid>", "x": 400, "y": 80,  "w": 200, "h": 140 },
    { "kind": "url",      "id": "<uuid>", "x": 640, "y": 80,  "w": 200, "h": 80  }
  ]
}
```
(`cluster_id` applies to `resource` nodes only — clusters group resources, see §4.)

`viewport` JSONB shape:
```json
{ "x": 0.0, "y": 0.0, "zoom": 1.0 }
```

**Ephemeral (view) state — React state only, never persisted:**
- Current selection, hover, and any in-flight drag position.

Rules:
- Persistent state MUST be rehydrated from Postgres on page load / browser refresh.
- `localStorage` MAY be a short-lived cache, but MUST NOT be the source of truth. On load,
  the DB value always wins.

---

## 6. Autosave behaviour

- On any persistent canvas change, schedule a save **debounced to 800 ms** after the last change.
- Also flush immediately on `blur` and on `beforeunload`.
- A save is a single `UPDATE canvas_state ... WHERE project_id = $1 AND version = $2`,
  then increment `version`. On version mismatch (another tab saved first), re-fetch,
  re-apply, then retry once.
- Do NOT save on every drag frame. Only persist when the value settles.

---

## 7. Shared resources, editing, and Detach

This is the core sharing capability: shared resources with no duplication.

**Adding a resource to a project**
- Insert a row into `project_resources (project_id, resource_id)` — a reference, no copy.

**Editing a resource (the shared/global edit)**
- Write the new blob, recompute `content_hash`, then `UPDATE resources ... WHERE id = $1
  AND version = $2`, increment `version`.
- The change is visible in **every** project that references it (timing below).
- The UI MUST show how many projects use a resource (e.g. "used in 3 projects").

**Detach (make a private copy) — the ONLY way resource duplication happens**
When a user wants to edit a resource for the current project only:
1. Mint a new `resource_id` (UUIDv7).
2. Copy the bytes to a new file in `resources/`.
3. Insert the new `resources` row.
4. In the current project, repoint EVERY reference to the old resource id, in one transaction:
   - replace its `project_resources` row,
   - update its `canvas_state` placement entries,
   - update its `cluster_members` rows,
   - update its `note_links` rows.
5. Other projects keep referencing the original, unaffected.

**Note links and editable notes are project-local** and are not subject to sharing or Detach.

**Propagation timing**
- An edit to a shared resource is reflected in other projects on their **next load**.
- Live propagation into another already-open project is NOT in scope for the first build.
  If added later it MUST use a notification channel (websocket / pub-sub); never poll.

---

## 8. Write ordering and integrity (prevents data loss)

Creating/editing anything with a file body (resource, note, chat) touches two systems. Order:

1. Write the content blob to disk and compute its `sha256` (resources) / write the `.md` (notes, chats).
2. Then `INSERT`/`UPDATE` the DB row with `file_path` (and `content_hash` for resources).

Rationale: a failed step 2 leaves a harmless orphan file. The reverse — a DB row pointing at
a file that was never written — is real data loss and MUST NOT be possible.

- Concurrent edits to one resource OR one note use optimistic concurrency: `UPDATE ...
  WHERE id = $1 AND version = $2`, bump `version`, on mismatch re-fetch + apply + retry once.
- Multi-table operations MUST run inside a single DB transaction.

---

## 9. Deletes and reference counting

- **Reference count** of a resource = rows in `project_resources` for it.
- **Removing a resource from a project** = delete that one `project_resources` row (and its
  `note_links`, `cluster_members`, and canvas placement in that project). Bytes untouched
  if any other project still references it.
- **Deleting a note or URL link** = soft-delete it. Deleting a note also removes its
  `note_links` rows. Notes/links belong to one project, so nothing else is affected.
- **Deleting a project** = soft-delete the project and remove its `project_resources`,
  `notes`, `url_links`, and `note_links`. Shared resources survive if another project
  references them.
- A resource becomes a **purge candidate** only when its reference count reaches zero; even
  then it is soft-deleted first and bytes removed only by an explicit purge job.
- All normal queries exclude soft-deleted rows (`WHERE deleted_at IS NULL`).
- **Orphan sweep:** in the shared resource store, deletes resource blobs with no matching
  `resources` row, but MUST NOT delete a blob whose row still has any `project_resources`
  reference. Inside a project's `root_path` folder, the sweep MUST only **report** unmatched
  files, never auto-delete them — the user owns that folder and may keep their own files in it.

Normal user actions never purge bytes. Purge is always a separate, explicit operation.

---

## 10. API endpoints (minimum)

```
POST   /projects                          create project (creates dir + canvas_state row)
GET    /projects                          list active projects
GET    /projects/:id                      project + resources + notes + url_links + clusters
DELETE /projects/:id                      soft delete (drops its references, notes, links)

POST   /resources                         create resource (blob first, then row — §8)
GET    /resources/:id                     fetch resource (incl. reference count)
PUT    /resources/:id                     edit resource content (global; version check)
DELETE /resources/:id                     remove only if reference count is 0

POST   /projects/:id/resources            reference an existing resource from this project
DELETE /projects/:id/resources/:rid       remove this project's reference (refcount--)
POST   /projects/:id/resources/:rid/detach   Detach: private copy for this project (§7)

POST   /projects/:id/notes                create note (writes .md, then row)
GET    /projects/:id/notes                list notes for this project
PUT    /notes/:id                         edit note (version check)
DELETE /notes/:id                         soft delete (also removes its note_links)
POST   /notes/:id/links                   link note -> resource (validate same-project; §4)
DELETE /notes/:id/links/:rid              remove a note->resource link

POST   /projects/:id/urls                 create URL link
GET    /projects/:id/urls                 list URL links for this project
PUT    /urls/:id                          edit URL link
DELETE /urls/:id                          soft delete

GET    /projects/:id/canvas               fetch canvas_state
PUT    /projects/:id/canvas               save canvas_state (version check)

POST   /projects/:id/clusters             create cluster
PUT    /clusters/:id/members              set cluster membership (resource_ids)

POST   /projects/:id/chats                create chat (writes .md, then row)
GET    /projects/:id/chats                list chats ordered by `ordering`
```

---

## 11. Definition of done (acceptance criteria)

The implementation is correct only if all of these pass:

1. Refreshing the browser restores the exact canvas layout and viewport for the open project.
2. Switching projects and switching back shows each project's own canvas unchanged.
3. A slow save for Project A that completes after switching to B does NOT alter B.
4. Editing a shared resource in one project, then opening another project that references it,
   shows the updated content — with no file duplicated on disk.
5. Detaching a resource creates an independent copy; later edits to either do not affect the
   other; and the detaching project's canvas placement, cluster membership, and note links
   all repoint to the copy.
6. Deleting a project does NOT remove resources still referenced by another project.
7. A resource's file is only removed once no project references it (and only via purge).
8. Notes and URL links created in one project NEVER appear in any other project.
9. A note's links to artifacts persist across browser refresh and project switching, and the
   connectors render from `note_links` (not from saved layout).
10. A note cannot be linked to a resource its project does not reference (rejected by API).
11. Deleting a note removes its links but leaves the linked resources intact.
12. Killing the server mid-create never leaves a DB row pointing at a missing file.
13. Two tabs editing the same resource or note do not silently overwrite each other
    (version check forces re-apply + retry).
14. The UI shows, for any shared resource, how many projects reference it.

---

## 12. Anti-patterns — do NOT do these

- Do NOT use file paths or file names as primary identity.
- Do NOT store canvas state only in `localStorage` or only in React state.
- Do NOT share notes or URL links between projects — they are project-specific.
- Do NOT duplicate resource bytes implicitly. Duplication happens ONLY via Detach.
- Do NOT store a resource's position/size on the resource — placement is per-project.
- Do NOT store note->resource connectors in the layout JSON — derive them from `note_links`.
- Do NOT let a note link to a resource its project does not reference.
- Do NOT delete a resource's bytes while any project still references it.
- Do NOT write the DB row before the file is safely on disk.
- Do NOT hard-delete on a normal delete action.
- Do NOT save canvas state on every drag frame.
- Do NOT apply a save response for a project that is no longer active.
- Do NOT poll the database to detect resource edits — use a notification channel if/when
  live cross-project propagation is added.

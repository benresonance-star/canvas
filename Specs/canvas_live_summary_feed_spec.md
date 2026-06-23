# Canvas Live Summary Feed — Codex Implementation Spec

## 0. Purpose

Implement a staged **Live Summary Feed** feature for the Canvas Master app.

The first target feed is:

> **Melbourne Development Summary**

The feature creates a live Canvas artifact that is updated by an OpenAI API-backed report generator. Each generated report becomes an immutable artifact version, appears as the latest update in the Canvas artifact, is available in a scrollable history view, and creates a project-level update notification in the top-left project update flag.

The implementation must be built in stages so the app remains stable and testable.

---

## 1. Existing environment assumptions

The app already has:

- React desktop UI.
- Canvas-based artifact UI.
- Docker Desktop environment.
- Postgres database.
- Backend API server.
- WebSocket layer.
- OpenAI API key available or to be added.
- Existing artifact concepts such as notes, links, flows, or similar Canvas cards.
- Existing project concept or project folder concept.
- Current UI has a top-left project area where an update flag can be added.

If the current codebase uses different names for these concepts, adapt the names while preserving the architecture.

---

## 2. Core rule

Postgres is the source of truth.

The client may cache state, but it must not become the authority for artifact content, version history, update events, or feed configuration.

WebSockets are only change notifications. A WebSocket event should cause the client to refetch canonical data from the API rather than directly mutating complex local state.

---

## 3. Feature overview

The feature has five visible parts:

1. **Live Summary Artifact Card**
   - Displays the latest generated report.
   - Shows date, feed name, status, and a compact summary.
   - Has buttons for:
     - `History`
     - `Run update now`
     - `Update controls`
     - `Sources`

2. **History Drawer**
   - Shows all prior reports.
   - Newest first.
   - Each report appears in a distinct container with date stamp, version number, source label, and markdown body.

3. **Project Update Flag**
   - Appears near the top-left project selector/project area.
   - Shows unread update count.
   - Opens a list of project update events.
   - Allows marking one or all updates as read.

4. **Update Controls Panel**
   - Allows the user to control how the summary feed updates.
   - MVP controls:
     - Active/inactive toggle.
     - Manual run button.
     - Schedule mode: manual only / weekly / daily.
     - Preferred scheduled time.
     - “Only create update if meaningful change” toggle.
     - Minimum change threshold.
     - Max source context size.
   - Later controls:
     - model selection
     - temperature
     - report format
     - include/exclude specific source groups

5. **Source Selector Panel**
   - Shows which app sources are included in the feed.
   - MVP sources:
     - previous summary
     - selected Canvas notes/artifacts
     - manual seed text
     - project assumptions
   - Each source can be enabled or disabled.

---

## 4. Non-goals for this stage

Do not attempt to read ChatGPT conversation history directly.

The OpenAI API can generate reports from source material supplied by this app. It does not automatically access the user’s private ChatGPT sidebar conversations.

Initial content should be seeded by manual paste/import into the app.

Do not implement full semantic search, embeddings, or external document ingestion in this slice unless the app already has those systems ready.

Do not over-build agent orchestration. This is a scheduled report feed, not a free-roaming autonomous agent.

---

## 5. Recommended implementation stages

## Stage 1 — Database and backend foundation

Goal:

Create the persistent model for live summary artifacts, immutable versions, feed configuration, feed sources, update events, and run logs.

### 5.1 Database tables

Add or adapt these tables.

If equivalent tables already exist, add missing fields rather than duplicating concepts.

### `artifacts`

```sql
create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  kind text not null,
  title text not null,
  status text not null default 'active',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Required artifact kind:

```txt
live_summary_feed
```

### `artifact_versions`

```sql
create table if not exists artifact_versions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts(id) on delete cascade,
  version_number integer not null,
  title text,
  summary_md text not null,
  structured_json jsonb,
  source_label text,
  source_thread_title text,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),

  unique (artifact_id, version_number)
);
```

### `summary_feeds`

```sql
create table if not exists summary_feeds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  artifact_id uuid not null references artifacts(id) on delete cascade,
  name text not null,
  description text,
  schedule_mode text not null default 'manual',
  schedule_cron text,
  preferred_time_local text,
  timezone text not null default 'Australia/Melbourne',
  is_active boolean not null default true,
  only_create_update_if_meaningful boolean not null default true,
  minimum_change_threshold numeric not null default 0.25,
  max_source_chars integer not null default 24000,
  model text not null default 'gpt-5.5',
  temperature numeric not null default 0.2,
  system_prompt text not null,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `feed_sources`

```sql
create table if not exists feed_sources (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references summary_feeds(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  source_label text not null,
  manual_text text,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Allowed `source_type` values for MVP:

```txt
previous_summary
manual_text
canvas_artifact
canvas_note
project_assumptions
```

### `project_update_events`

```sql
create table if not exists project_update_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  artifact_id uuid references artifacts(id) on delete cascade,
  version_id uuid references artifact_versions(id) on delete cascade,
  feed_id uuid references summary_feeds(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
```

### `summary_feed_runs`

```sql
create table if not exists summary_feed_runs (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references summary_feeds(id) on delete cascade,
  status text not null,
  trigger_type text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source_char_count integer,
  output_char_count integer,
  created_version_id uuid references artifact_versions(id),
  error_message text,
  model text,
  raw_response jsonb
);
```

Allowed run statuses:

```txt
queued
running
succeeded
skipped_no_meaningful_change
failed
```

Allowed trigger types:

```txt
manual
scheduled
test
```

---

## 6. Stage 1 backend endpoints

Implement the following endpoints.

### Create a live summary feed

```http
POST /api/projects/:projectId/summary-feeds
```

Request:

```json
{
  "name": "Melbourne Development Summary",
  "description": "Scheduled feasibility summary for Melbourne development work.",
  "scheduleMode": "manual",
  "preferredTimeLocal": "08:00",
  "timezone": "Australia/Melbourne",
  "systemPrompt": "You are a careful project analyst..."
}
```

Behaviour:

1. Create an artifact with `kind = live_summary_feed`.
2. Create a summary feed pointing to that artifact.
3. Add a default `previous_summary` feed source.
4. Return feed and artifact IDs.

### Get feeds for a project

```http
GET /api/projects/:projectId/summary-feeds
```

### Get one feed

```http
GET /api/summary-feeds/:feedId
```

### Update feed controls

```http
PATCH /api/summary-feeds/:feedId
```

Request fields may include:

```json
{
  "isActive": true,
  "scheduleMode": "weekly",
  "preferredTimeLocal": "08:00",
  "timezone": "Australia/Melbourne",
  "onlyCreateUpdateIfMeaningful": true,
  "minimumChangeThreshold": 0.25,
  "maxSourceChars": 24000,
  "model": "gpt-5.5",
  "temperature": 0.2
}
```

### Get feed sources

```http
GET /api/summary-feeds/:feedId/sources
```

### Add feed source

```http
POST /api/summary-feeds/:feedId/sources
```

### Update feed source

```http
PATCH /api/feed-sources/:sourceId
```

### Delete feed source

```http
DELETE /api/feed-sources/:sourceId
```

### Run feed now

```http
POST /api/summary-feeds/:feedId/run
```

Request:

```json
{
  "triggerType": "manual"
}
```

Behaviour:

1. Create `summary_feed_runs` row with `running` status.
2. Gather enabled feed sources.
3. Build context package.
4. Call OpenAI API.
5. Validate structured output.
6. If meaningful change check is enabled, compare with previous report.
7. If skipped, update run status to `skipped_no_meaningful_change`.
8. If saved, create new artifact version.
9. Update artifact `current_version_id`.
10. Create project update event.
11. Broadcast WebSocket events.
12. Return created version or skip result.

### Get artifact latest

```http
GET /api/artifacts/:artifactId
```

### Get artifact history

```http
GET /api/artifacts/:artifactId/history
```

Return newest first.

### Get project updates

```http
GET /api/projects/:projectId/updates
```

Query options:

```txt
?unreadOnly=true
?limit=20
```

### Mark one update read

```http
POST /api/project-updates/:updateId/mark-read
```

### Mark all project updates read

```http
POST /api/projects/:projectId/updates/mark-read
```

---

## 7. Stage 2 — Manual feed run, no scheduler yet

Goal:

Prove the full loop manually before scheduling.

User flow:

1. User creates Melbourne Development Summary feed.
2. User adds manual seed text or links a Canvas note as source.
3. User clicks `Run update now`.
4. Backend calls OpenAI.
5. New artifact version is saved.
6. Canvas artifact shows latest report.
7. History button shows the generated report.
8. Top-left update flag shows an unread update.

This stage must pass before any scheduled worker is added.

---

## 8. OpenAI report generation

The OpenAI call must happen server-side only.

Never expose the OpenAI API key to the React client.

Use environment variable:

```txt
OPENAI_API_KEY=
```

### 8.1 Report system prompt

Use this as the default feed system prompt:

```txt
You are the Melbourne Development Summary analyst for a Canvas project management system.

Your task is to produce a careful, concise, decision-useful project update from the supplied sources.

You must:
- Focus on material changes since the previous summary.
- Separate current position, risks, open questions, and next actions.
- Avoid pretending certainty where the sources are incomplete.
- Preserve important assumptions and constraints.
- Flag stale or missing information.
- Avoid legal, financial, or planning advice language. Use decision-support language.
- Do not invent source facts.
- If there is no meaningful change, state that clearly.
- Output valid JSON only.
```

### 8.2 User/context message format

Build the context like this:

```txt
Feed: Melbourne Development Summary
Project timezone: Australia/Melbourne
Run timestamp: {timestamp}

Previous summary:
{previous_summary}

Enabled sources:
SOURCE 1 — {source_label}
{source_text}

SOURCE 2 — {source_label}
{source_text}

Task:
Generate a new project summary report.
```

### 8.3 Required JSON output schema

The model output must validate against this structure:

```json
{
  "title": "string",
  "summaryDate": "YYYY-MM-DD",
  "executiveSummary": "string",
  "meaningfulChangeDetected": true,
  "changeScore": 0.0,
  "changesSinceLastUpdate": ["string"],
  "currentPosition": "string",
  "risks": ["string"],
  "openQuestions": ["string"],
  "recommendedNextActions": ["string"],
  "staleOrMissingInformation": ["string"],
  "markdownReport": "string"
}
```

Validation rules:

- `title` required.
- `summaryDate` required.
- `executiveSummary` required.
- `meaningfulChangeDetected` required boolean.
- `changeScore` required number between 0 and 1.
- `markdownReport` required.
- Arrays must be arrays even when empty.
- Reject invalid JSON and mark the run failed.
- Do not save a new artifact version when validation fails.

### 8.4 Meaningful change control

If `only_create_update_if_meaningful = true`:

- Save a new version only when:
  - `meaningfulChangeDetected = true`, and
  - `changeScore >= minimum_change_threshold`

If not meaningful:

- Do not create a new artifact version.
- Do create or update a run log with status `skipped_no_meaningful_change`.
- Do not create a project update event.
- Return a clear API response:

```json
{
  "status": "skipped_no_meaningful_change",
  "changeScore": 0.12,
  "message": "No meaningful change detected. No new Canvas update was created."
}
```

---

## 9. Stage 3 — React UI

Goal:

Add user-facing controls and displays.

### 9.1 Components

Implement these components or equivalents:

```txt
LiveSummaryArtifactCard
ArtifactHistoryDrawer
ProjectUpdateFlag
SummaryFeedControlsPanel
SummaryFeedSourcePanel
RunFeedNowButton
```

### 9.2 LiveSummaryArtifactCard

Required display:

- Feed/artifact title.
- LIVE or inactive status.
- Last updated date.
- Latest report preview.
- Buttons:
  - History
  - Run update now
  - Update controls
  - Sources

Behaviour:

- On mount, fetch artifact latest.
- On WebSocket `artifact.updated`, refetch latest artifact.
- On manual run success, refetch latest artifact and update list.
- Do not directly edit latest content in local state except through refetch.

### 9.3 ArtifactHistoryDrawer

Required display:

- Newest report first.
- Distinct container per version.
- Version number.
- Date stamp.
- Source label.
- Markdown report.

Required behaviour:

- Open from History button.
- Fetch history from API when opened.
- Support scroll.
- Empty state if no versions exist.

### 9.4 ProjectUpdateFlag

Required display:

- Positioned near the top-left project selector/project area.
- Shows unread count.
- Opens a dropdown/panel.
- Each update row shows:
  - title
  - body preview
  - timestamp
  - related artifact/feed if available

Required behaviour:

- Fetch unread updates on project load.
- Subscribe to WebSocket `project.update.created`.
- On event, refetch unread updates.
- Mark one read.
- Mark all read.
- Clicking an update focuses/opens the related artifact if possible.

### 9.5 SummaryFeedControlsPanel

Required controls:

- Active/inactive toggle.
- Schedule mode:
  - manual
  - daily
  - weekly
- Preferred local time.
- Timezone display/input.
- Only create update if meaningful toggle.
- Minimum change threshold numeric input.
- Max source chars numeric input.
- Model field.
- Temperature numeric input.
- Save controls button.

MVP note:

The schedule settings may be saved in Stage 3 even before the scheduler is implemented. The scheduler itself comes in Stage 4.

### 9.6 SummaryFeedSourcePanel

Required controls:

- List enabled and disabled sources.
- Add manual text source.
- Add existing Canvas artifact/note as source if the app has a selector.
- Enable/disable source.
- Delete source.
- Edit manual source text.
- Sort order optional.

---

## 10. Stage 4 — WebSocket integration

Goal:

Ensure UI stays in sync without direct mutation hacks.

### 10.1 Server events

Emit after a successful feed run that creates a new version:

```json
{
  "type": "artifact.updated",
  "projectId": "uuid",
  "artifactId": "uuid",
  "versionId": "uuid",
  "createdAt": "ISO timestamp"
}
```

Also emit:

```json
{
  "type": "project.update.created",
  "projectId": "uuid",
  "artifactId": "uuid",
  "versionId": "uuid",
  "feedId": "uuid",
  "title": "Melbourne Development Summary updated",
  "createdAt": "ISO timestamp"
}
```

### 10.2 Client behaviour

On `artifact.updated`:

- If the artifact is mounted or visible, refetch latest artifact.
- Do not mutate version content directly from WebSocket payload.

On `project.update.created`:

- Refetch unread project updates.
- Update top-left badge via canonical API result.

---

## 11. Stage 5 — Scheduled worker

Goal:

Run active feeds automatically.

Add a Docker service or backend worker process.

Suggested service:

```txt
summary-worker
```

Worker behaviour:

1. Every minute, find active feeds where `next_run_at <= now()`.
2. For each due feed, call the same internal run function used by manual runs.
3. Use `trigger_type = scheduled`.
4. After run, compute and save the next `next_run_at`.
5. Log all runs in `summary_feed_runs`.

Supported schedule modes:

```txt
manual
daily
weekly
```

MVP schedule interpretation:

- `manual`: never scheduled.
- `daily`: every day at `preferred_time_local`.
- `weekly`: every Monday at `preferred_time_local`.

Timezone:

- Use `summary_feeds.timezone`.
- Default to `Australia/Melbourne`.

Docker:

- Add worker to `docker-compose.yml`.
- Ensure it has:
  - database connection env vars
  - OpenAI API key
  - same backend code or shared run module

---

## 12. Stage 6 — Testing and hardening

Goal:

Lock down the feature with tests before expanding sources or adding intelligence.

### 12.1 Backend unit tests

Test feed creation:

- Creates artifact.
- Creates summary feed.
- Adds default previous summary source.
- Returns IDs.

Test feed controls update:

- Can change active flag.
- Can change schedule mode.
- Can change meaningful-change settings.
- Rejects invalid threshold values.
- Rejects invalid schedule mode.

Test source management:

- Can add manual text source.
- Can enable/disable source.
- Can delete source.
- Disabled sources are excluded from report context.

Test OpenAI output validation:

- Accepts valid JSON.
- Rejects invalid JSON.
- Rejects missing required fields.
- Rejects changeScore outside 0..1.
- Rejects markdownReport missing.

Test feed run success:

- Creates run log.
- Creates artifact version.
- Updates artifact current version.
- Creates project update event.
- Emits WebSocket events.

Test meaningful-change skip:

- Does not create artifact version.
- Does not create project update event.
- Marks run as `skipped_no_meaningful_change`.
- Returns clear skip response.

Test artifact history:

- Returns newest first.
- Includes version number and created date.
- Does not lose prior versions after update.

Test project updates:

- Unread count increments after successful run.
- Mark one read works.
- Mark all read works.

### 12.2 Frontend component tests

Test LiveSummaryArtifactCard:

- Renders latest summary.
- Shows empty state.
- Opens history drawer.
- Opens update controls.
- Opens sources panel.
- Run update button calls API and refreshes.

Test ArtifactHistoryDrawer:

- Fetches history on open.
- Shows newest first.
- Displays distinct containers.
- Handles empty history.

Test ProjectUpdateFlag:

- Shows unread count.
- Opens update list.
- Refetches on WebSocket notification.
- Mark all read clears badge.
- Click update focuses artifact if supported.

Test SummaryFeedControlsPanel:

- Loads current controls.
- Saves changed controls.
- Validates threshold input.
- Validates max source chars.
- Shows manual/daily/weekly modes.

Test SummaryFeedSourcePanel:

- Adds manual source.
- Edits manual source.
- Enables/disables source.
- Deletes source.

### 12.3 Integration tests

Manual run integration:

1. Create feed.
2. Add manual source.
3. Mock OpenAI response.
4. Run feed.
5. Verify latest artifact displays output.
6. Verify history contains one version.
7. Verify update flag increments.

Second run integration:

1. Existing feed has one version.
2. Mock OpenAI response with meaningful change.
3. Run feed.
4. Verify history contains two versions.
5. Verify latest points to second version.

Skip integration:

1. Existing feed has one version.
2. Mock OpenAI response with low change score.
3. Run feed.
4. Verify no new version.
5. Verify no project update event.

WebSocket integration:

1. Trigger successful feed run.
2. Confirm WebSocket event emitted.
3. Confirm client refetch path called.

Scheduler integration:

1. Create active daily feed due now.
2. Worker picks it up.
3. Worker creates version.
4. Worker updates next_run_at.

---

## 13. Error handling

Backend should return clear errors for:

- Missing OpenAI API key.
- No enabled sources.
- Source context too large after truncation.
- OpenAI API failure.
- Invalid model JSON.
- Database write failure.
- Feed not found.
- Artifact not found.
- Invalid schedule mode.
- Invalid threshold.

UI should show:

- Non-blocking error toast for run failure.
- Run log status in controls panel.
- “No update created” message when skipped due to low meaningful-change score.
- Clear empty state when no report exists yet.

---

## 14. Security and privacy

- OpenAI API key must remain server-side.
- Do not send all project data by default.
- Only enabled feed sources are included.
- Show source list to user.
- Store run logs.
- Avoid logging full sensitive source content unless current app already treats logs as private.
- Never expose raw OpenAI API errors with secrets to the client.
- Truncate context according to `max_source_chars`.

---

## 15. Data separation rules

Keep these separate:

```txt
Canvas placement
Artifact identity
Artifact latest content
Artifact version history
Summary feed configuration
Feed source list
Project update notifications
Run logs
```

Do not mix placement with artifact content.

Updating the summary must not move the Canvas card.

Moving the Canvas card must not create a new summary version.

Reading an update notification must not alter artifact history.

---

## 16. Acceptance criteria

The feature is complete when:

1. A Melbourne Development Summary feed can be created.
2. The feed creates a live Canvas artifact.
3. The user can add seed/source text.
4. The user can run an update manually.
5. The backend calls OpenAI server-side.
6. The response is validated as JSON.
7. A new immutable artifact version is saved.
8. The artifact displays the latest report.
9. History shows all prior reports newest first.
10. A top-left project update flag shows unread updates.
11. Update events can be marked read.
12. Feed controls can be changed and saved.
13. Meaningful-change control can skip low-value updates.
14. WebSocket events cause refetch, not direct local mutation.
15. Scheduled worker can run daily or weekly feeds.
16. Tests cover creation, manual runs, history, update flag, controls, meaningful-change skip, WebSocket behaviour, and scheduler behaviour.
17. OpenAI API key is never exposed to frontend.
18. The app remains stable if OpenAI fails or returns invalid JSON.

---

## 17. First target seed content

Use this as optional initial manual text source for the Melbourne Development Summary feed:

```md
# Melbourne Development Feasibility — Seed Summary

## Current focus

Brighton / Bayside townhouse feasibility, with emphasis on conservative project survivability rather than optimistic maximum yield.

## Main development thesis

The target strategy is to test whether a Melbourne/Bayside townhouse project can produce enough value to allow some dwellings to be sold and one or more dwellings retained debt-free or with low residual debt.

## Key feasibility themes

- Landowner equity or JV structures may reduce upfront land acquisition pressure, but they do not remove project risk.
- A 4-townhouse scheme may be fragile if planning, construction, finance, or sale values soften.
- A 3-townhouse redesign may improve planning robustness but can damage the retain-two-dwellings ambition.
- Sell-down-to-retain strategies are highly sensitive to construction cost, end value, GST/tax, finance terms, delays, and refinance valuation.
- Pre-application planning advice and a town planner should come before architectural over-commitment.
- Conservative failure-mode testing is more useful than optimistic feasibility modelling.

## Known project risks

- Council yield risk.
- Construction cost escalation.
- Finance and refinance risk.
- JV split optimism.
- Hidden cash requirements.
- GST and tax traps.
- Basement or parking cost blowouts.
- NCC / ResCode / planning compliance surprises.
- Market value softening before completion.

## Current operating principle

Do not ask: “Can the scheme work if things go well?”

Ask: “Can the scheme survive if yield drops, costs rise, values soften, and refinance is conservative?”
```

---

## 18. Codex working method

Implement in small commits.

Suggested sequence:

1. Add migrations.
2. Add repository/service layer.
3. Add feed creation endpoint.
4. Add source management endpoints.
5. Add manual run endpoint with mocked OpenAI first.
6. Add OpenAI call and JSON validation.
7. Add artifact latest/history endpoints.
8. Add project update endpoints.
9. Add React card and history drawer.
10. Add project update flag.
11. Add feed controls panel.
12. Add source panel.
13. Add WebSocket events/refetch behaviour.
14. Add scheduled worker.
15. Add tests and fix failures.

After each stage:

- Run typecheck.
- Run tests.
- Run lint if available.
- Manually verify one happy path.
- Do not proceed to the next stage if the current stage breaks existing Canvas behaviour.

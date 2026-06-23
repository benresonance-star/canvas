# Canvas primitives

## Run Postgres + API

From repo root:

```bash
docker compose up -d
cd canvas
npm install
npm run db:migrate
npm run server
```

In another terminal:

```bash
cd canvas
npm run dev
```

Vite proxies `/api` → `http://localhost:3001`.

### Windows: verify the stack

From repo root (`Canvas`):

```powershell
docker compose up -d
cd canvas
npm install
npm run db:migrate
```

**Terminal 1 — API:**

```powershell
cd canvas
npm run server
```

**Terminal 2 — UI** (use Vite so `/api` proxies to port 3001):

```powershell
cd canvas
npm run dev
```

Open the app at `http://localhost:5173` (not a static build unless `VITE_PRIMITIVES_API` points at the API).

| Check | Command | Expected |
|-------|---------|----------|
| Postgres | `docker ps` | `canvas-postgres` healthy |
| API health | `curl http://localhost:3001/health` | `{"ok":true}` |
| Via Vite proxy | `curl http://localhost:5173/api/health` | `{"ok":true}` |

If `/health` returns `503`, Postgres is down or unreachable — fix Docker before expecting workspace sync.

Use `npm run server` (includes `--use-system-ca` on Windows), not `node server/index.js` alone.

## Project list and canvas (cross-browser on one PC)

When Postgres and the API are running, the **project list** and **canvas layout** (cards, positions, names) are stored in Postgres and shared by any browser that opens `http://localhost:5173` with the same local stack.

| Stored on server (shared) | One-time per browser |
|---------------------------|----------------------|
| Project index, active project id, canvas JSON, sync-holding dock (staged artefacts) | **Folder permission** — Reconnect to the synced folder name (browser security) |
| OpenAI API key (encrypted) | — |
| Agent chat session (messages + context registry) | — |
| Card preview blobs (images, PDF, video, audio) | — |
| Workspace primitives (artifacts, graph) | — |

**First launch after upgrade:** local data migrates to the server automatically (console: `Migrated N project(s)…` / `Migrated agent chat session…`).

**API offline:** projects and chat fall back to browser storage only; a banner explains that server sync is unavailable.

**Another browser:** open the same URL with `npm run dev` + `npm run server` + Docker Postgres. Projects, keys, chat, and previews appear without re-entry. Click **Reconnect** once per project to approve the same folder name shown in the UI. The project menu re-fetches the server index on load, after background sync, and when you return to the tab; new projects are pushed to the server immediately when created or deleted.

**Sync-holding dock:** Cards docked to the bottom tray are saved in the project JSON (`stagedSyncCards`) and persist across refresh and cross-browser sync (no folder resync required to restore dock chips).

**Artifact sub-clusters:** Sub-clusters and cluster hulls belong to the **active project** only. Switching projects clears cluster UI state and reloads that project's workspace cluster from the API.

**Loading:** The canvas should appear within a few seconds. Large projects continue syncing in the background (check the browser console). If you only see “Loading canvas…”, open DevTools → Console for errors, confirm `npm run server` is running, then hard-refresh.

**Only “Untitled” in the project list (real projects missing):** Another browser may have created an empty Untitled project on the server first; sync used to replace your fuller local list with that single entry. The app now **merges** local and server project lists on load and uploads missing projects in the background. Refresh the browser where your work lives (often Cursor’s preview) with `npm run server` and Postgres running — you should see a toast like “Restored N projects…” and both names in the project switcher (grid icon, top-left). Orphan project data under `canvas:project:*` in localStorage is re-added to the index automatically when possible.

**Chrome shows “Untitled” but Cursor shows your real project:** Open the app in the browser that already has your work, with the API running, and wait for `Migrated N project(s)…` or `Synced N project(s)…` in the console (or the restore toast). Then hard-refresh Chrome at the same URL (`http://localhost:5173`). Do not use a `file://` path. If this browser has never had your projects, use the banner hint to open the app where they exist first.

## Project folder link

Each project remembers its connected folder in **IndexedDB** (per project id). After a browser refresh:

- If the browser still grants access, the folder reconnects automatically and sync runs.
- Otherwise use **Reconnect folder** (bottom right) — one click to re-approve the same folder without picking it again.
- In Chrome, choose **Allow on every visit** when prompted so fewer reconnects are needed. Installing the app as a PWA can also improve persistence.

If you see “folder link could not be saved”, connect the folder again before refreshing.

## Agent mode (single agent / ChatGPT or Gemma Local)

Start the API with `npm run server`. On first run it creates `canvas/.data/agent-master.key` (gitignored) to encrypt keys in Postgres — you do **not** need to set `AGENT_SECRETS_KEY` for local use (optional override for production).

In the app: **Agent mode** → Mode **Single agent** → **ChatGPT** → enter API key → **Save** once. Keys persist until **Replace** or **Remove** in the configuration menu. Chat requests go through `POST /api/agent/chat` so the key never returns to the browser.

For a local model, run Ollama separately from the default Postgres compose
service:

```powershell
docker run -d --name canvas-ollama -p 11434:11434 ollama/ollama
docker exec canvas-ollama ollama pull gemma4:12b
docker exec canvas-ollama ollama pull gemma4:26b  # optional 26B model
```

Then select **Gemma 12B Local** or **Gemma 26B Local** in the same agent
selector. They use `http://localhost:11434/api/chat`, do not need an API key,
and each model is enabled only when `/api/tags` reports its tag is available.
Gemma 26B appears unavailable until `gemma4:26b` finishes pulling.

### Agent context (selected files)

With **Selected items** or **Visible canvas**, the agent receives **file content** when you add files to context—not just filenames:

- **Markdown / text / HTML / notes** — from synced `payload_text` in Postgres, or read from the connected folder
- **PDF** — text extracted in the browser when you send a message (folder must be connected)
- **Images** — sent as vision input when the selected agent supports images (`canReadImages: true` for ChatGPT and Gemma 12B/26B). Sources: preview cache, linked folder, inline `dataUrl` on generated image cards, or artifact `payload_text`. Unsupported connectors show a warning and block send rather than silently dropping images.

**Session cache:** Each file is sent to the API **once per chat session** (until you clear the API key or use **Resend all selected files to AI**). Follow-up messages reuse the conversation history instead of re-uploading file bodies. Deselecting a file adds a short “removed from context” notice on the next send. The context list shows **Sent to AI** vs **Sends on next message** badges.

**Chat persistence:** Single-agent chat uses **threads** (multiple conversations per project and connector). Each thread has its own history in **Postgres** / localStorage, its own markdown transcript file in the connected folder (`notes__agent-chat-{connector}-{id}__v1.md`), and often an **agent_chat** card on the canvas. When you first open Agent mode, pick **New thread** or continue an existing one. **Switch thread** in the Threads section between Context and Chat. **Clear chat** empties the current thread’s messages; **Delete thread** removes the thread from the list and its canvas card (the `.md` file remains on disk unless you delete it manually).

If you see a yellow sync warning in the chat area:

- **API offline** — start Postgres + `npm run server` and use the app through `npm run dev`; confirm `/api/health` returns `ok: true`.
- **Workspace sync failed** — API is up but ingest failed; check the API server console, then use **Retry workspace sync** in the Agent panel.
- The app also retries sync when the API comes back or when you open Agent mode again.
- Without the button: send another chat message to trigger a debounced sync.

Images, video, audio, and spreadsheets other than the image case above are listed but not sent. Reconnect the project folder if files moved. Context is truncated automatically to stay within model limits.

| Mode | Per file | Total context | PDF pages |
|------|----------|---------------|-----------|
| Standard (default) | 24,000 chars | 80,000 chars | 40 |
| Extended (opt-in in Agent panel) | 60,000 chars | 110,000 chars | 100 |

Before send, the app estimates **input tokens** and approximate USD cost via `POST /agent/estimate` (reply usage is billed separately). Large prompts (>25k input tokens) ask for confirmation.

### Corporate proxy / "fetch failed" on chat

Chat calls OpenAI from the **API server**, not the browser. If chat fails with a network error, test from the same machine:

```powershell
curl.exe -s -m 10 -o NUL -w "%{http_code}" https://api.openai.com/
```

On **Windows**, Node must trust the same certificates as Edge/Chrome. `npm run server` already passes `--use-system-ca` so OpenAI HTTPS works on personal PCs. If chat still fails:

- Restart with `npm run server` (not `node server/index.js` alone).
- **Antivirus “HTTPS scanning”** can break Node until you disable it or add its root CA via `NODE_EXTRA_CA_CERTS`.
- **Firewall/proxy** only if you use one: `$env:HTTPS_PROXY="http://proxy:8080"` before `npm run server`.

`GET /agent/health` reports `{ openaiReachable, openaiReachabilityError, ollamaReachable, ollamaModelAvailable, ollamaReachabilityError, secretsConfigured }`. Model-specific Ollama availability is reported by `GET /agent/connectors`.

## Inspect primitives

1. **Project menu** (grid icon, top-left) → **View primitives** — table for the active project.
2. **Card header** (box icon) — opens the inspector for that card’s pinned artifact (after folder sync).

## Tests

```bash
npm run test
```

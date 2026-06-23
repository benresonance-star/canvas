# Canvas

Local-first infinite canvas with revision-authoritative project sync, folder ingest, agent chat, and Postgres-backed spec migration.

## Quick start

### Dev stack commands

From `canvas/` (or tell Cursor):


| Say                | npm script                  | What it does                                                                               |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------ |
| **start canvas**   | `npm run dev:stack`         | Starts Docker Desktop if needed, then Postgres, migrate, Ollama, API (:3001), Vite (:5173) |
| **restart canvas** | `npm run dev:stack:restart` | Stops API/Vite, starts them again (Docker assumed already running)                         |
| **stop canvas**    | `npm run dev:stack:stop`    | Stops API/Vite only (Postgres + Ollama containers keep running)                            |


```bash
cd canvas
npm install
npm run dev:stack       # → http://localhost:5173
```

Full reference: **[docs/DEV_STACK.md](docs/DEV_STACK.md)** (config in `dev-stack.config.json`, logs in `.dev-stack/logs/`).

**AI agents:** follow **[AGENTS.md](AGENTS.md)** — use **start canvas** / **restart canvas** / **stop canvas** for local boot.

Manual steps (same result):

```bash
cd canvas
npm install
npm run db:up          # Postgres via docker compose
npm run db:migrate
npm run server         # API on :3001
npm run dev            # Vite on :5173
```

### Optional local Gemma agent

`start canvas` starts Ollama with the persistent Docker volume `ollama`. Gemma models are **downloaded on demand** when you select them in the app:

1. Open **Agent mode** → **Single agent**
2. Click **Gemma 12B Local** or **Gemma 26B Local** — Canvas pulls the model if missing (progress shown in the panel)

Manual Ollama setup (same volume):

```bash
docker run -d --name canvas-ollama -p 11434:11434 -v ollama:/root/.ollama ollama/ollama
```

Gemma uses `http://localhost:11434/api/chat` and does not need an API key.

## Architecture

See **[docs/ARCHITECTURE_MASTER_SPEC.md](docs/ARCHITECTURE_MASTER_SPEC.md)** — consolidated spec for module boundaries, target data architecture, spec migration, debugging, testing, and remediation progress.

**AI agents:** follow **[AGENTS.md](AGENTS.md)** for sync trace protocol and menu/canvas invariant rules.


| Document                                                        | Topic                                                                   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [DEV_STACK.md](docs/DEV_STACK.md)                               | Local dev stack — **start canvas**, **restart canvas**, **stop canvas** |
| [PROJECT_SYNC_API.md](docs/PROJECT_SYNC_API.md)                 | Frozen `projectSync.js` exports                                         |
| [placement-persistence-qa.md](docs/placement-persistence-qa.md) | Placement QA                                                            |


### Layer map

```
src/App.jsx          → composition root (target: thin)
src/features/        → extracted React hooks (sync, folder, agent)
src/components/      → presentational UI
src/lib/projects.js  → app facade
src/lib/persistence.js → load/save/commit
src/lib/sync/        → sync engine
server/routes/       → HTTP handlers
server/repositories/ → Postgres access
```

## Testing

```bash
npm run test:sync      # CI gate — patch, merge, placement
npm run test:features  # extracted feature hooks
npm test               # full suite
npm run lint
node scripts/capture-architecture-baseline.mjs
```

## Debugging sync

```js
localStorage.setItem('canvas-sync-trace', '1');
localStorage.setItem('canvas-placement-audit', '1');
// reload app
```

See master spec §9 for full debugging guide.

## Stack

React 19 · Vite · Express 5 · Postgres · IndexedDB · Vitest
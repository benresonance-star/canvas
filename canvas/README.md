# Canvas

Local-first infinite canvas with revision-authoritative project sync, folder ingest, agent chat, and Postgres-backed spec migration.

## Quick start

```bash
cd canvas
npm install
npm run db:up          # Postgres via docker compose
npm run db:migrate
npm run server         # API on :3001
npm run dev            # Vite on :5173
```

### Optional local Gemma agent

Canvas can also use Ollama as a local agent provider. Run Ollama separately from
the app's Postgres compose service:

```bash
docker run -d --name canvas-ollama -p 11434:11434 ollama/ollama
docker exec canvas-ollama ollama pull gemma4:12b
docker exec canvas-ollama ollama pull gemma4:26b  # optional 26B model
```

Then start Canvas normally and open **Agent mode** -> **Single agent**. The
existing agent selector will show **Gemma 12B Local** and **Gemma 26B Local**
alongside **ChatGPT**. Gemma uses `http://localhost:11434/api/chat` and does
not need an API key. Gemma 26B remains unavailable until `/api/tags` reports
`gemma4:26b` after the pull completes.

## Architecture

See **[docs/ARCHITECTURE_MASTER_SPEC.md](docs/ARCHITECTURE_MASTER_SPEC.md)** — consolidated spec for module boundaries, target data architecture, spec migration, debugging, testing, and remediation progress.

**AI agents:** follow **[AGENTS.md](AGENTS.md)** for sync trace protocol and menu/canvas invariant rules.

| Document | Topic |
|----------|-------|
| [PROJECT_SYNC_API.md](docs/PROJECT_SYNC_API.md) | Frozen `projectSync.js` exports |
| [placement-persistence-qa.md](docs/placement-persistence-qa.md) | Placement QA |

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

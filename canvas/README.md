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

## Architecture

See **[docs/ARCHITECTURE_MASTER_SPEC.md](docs/ARCHITECTURE_MASTER_SPEC.md)** — master spec for module boundaries, debugging, testing, and remediation progress.

| Document | Topic |
|----------|-------|
| [PROJECT_SYNC_API.md](docs/PROJECT_SYNC_API.md) | Frozen `projectSync.js` exports |
| [SPEC_MIGRATION.md](docs/SPEC_MIGRATION.md) | Spec data plane cutover |
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
localStorage.setItem('canvas:sync-trace', '1');
localStorage.setItem('canvas:placement-audit', '1');
// reload app
```

See master spec §7 for full debugging guide.

## Stack

React 19 · Vite · Express 5 · Postgres · IndexedDB · Vitest

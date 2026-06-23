# Canvas dev stack

Local development runs four pieces:

| Service | Port | How |
|---------|------|-----|
| **Postgres** | 5432 | `docker-compose.yml` → container `canvas-postgres` |
| **API** | 3001 | `npm run server` |
| **Vite** | 5173 | `npm run dev` (proxies `/api` → 3001) |
| **Ollama** | 11434 | Docker container `canvas-ollama` (Gemma models) |

Config lives in:

- [`dev-stack.config.json`](../dev-stack.config.json) — ports, container names, Ollama volume
- [`.env.example`](../.env.example) — copy to `.env` to override `DATABASE_URL`, `PORT`, etc.

## One command

From `canvas/`:

```bash
npm run dev:stack
```

This will:

1. Start **Docker Desktop** if it is not already running (Windows/macOS)
2. `docker compose up -d` Postgres
3. Wait for healthy DB → `npm run db:migrate`
4. Start or create `canvas-ollama` with the persistent `ollama` Docker volume (reuses models from a prior install)
5. Start API + Vite in the background on fixed ports **3001** and **5173** (`strictPort`; logs in `.dev-stack/logs/`)
6. `docker compose up -d` also starts the **live-worker** container (scheduled live artifacts; no exposed port)

Gemma models are **not** pulled at boot. In the app, open **Agent mode** → **Single agent** and select **Gemma 12B Local** or **Gemma 26B Local** — Canvas downloads the model on demand when you switch to it.

Stop API/Vite only:

```bash
npm run dev:stack:stop
```

Postgres and Ollama containers keep running. Stop them manually if needed:

```bash
docker stop canvas-postgres canvas-ollama
```

### Flags

```bash
node scripts/dev-stack.mjs --infra-only    # Docker + migrate only
node scripts/dev-stack.mjs --no-docker-boot # skip Docker Desktop launch
```

## Agent shortcuts

Tell Cursor (or any agent on this repo):

| Say | Agent runs | Result |
|-----|------------|--------|
| **start canvas** | `npm run dev:stack` from `canvas/` | Docker Desktop (if needed), Postgres, migrate, Ollama, API, Vite |
| **restart canvas** | `npm run dev:stack:restart` | Stop API/Vite, then start again (assumes Docker already running) |
| **stop canvas** | `npm run dev:stack:stop` | Stop API/Vite (Docker containers keep running) |

**start canvas** means: launch Docker Desktop when needed, then wait until the app is up at http://localhost:5173 and the API health check passes at http://localhost:3001/health.

For menu/canvas sync debugging after boot, see [AGENTS.md](../AGENTS.md) (browser checklist at http://localhost:5173).

## Manual (same result)

```bash
cd canvas
npm run db:up
npm run db:migrate
docker run -d --name canvas-ollama -p 11434:11434 -v ollama:/root/.ollama ollama/ollama   # once
npm run server    # terminal 1
npm run dev       # terminal 2
```

Pull Gemma models from the app (Agent mode → select Gemma 12B/26B) or manually:

```bash
docker exec canvas-ollama ollama pull gemma4:12b
docker exec canvas-ollama ollama pull gemma4:26b
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Docker not ready / compose fails | Say **start canvas** (auto-starts Docker Desktop on Windows/macOS) or open Docker Desktop manually |
| API "limited mode" / `ECONNREFUSED :5432` | `npm run db:up`, wait ~10s, re-run `dev:stack` |
| Agent models missing | Select the Gemma agent in Agent mode (auto-download) or `docker exec canvas-ollama ollama pull gemma4:12b` |
| Models vanished after `start canvas` | Old `canvas-ollama` without volume — re-run **start canvas** (recreates with `ollama` volume) or `docker start ollama` |
| Port already in use | `npm run dev:stack:stop` or kill the process on 3001/5173 |
| **502** on live artifacts / "cannot reach API" banner | API not on :3001 — run **restart canvas** (`npm run dev:stack:restart`); check `curl http://localhost:3001/health` and `curl http://localhost:5173/api/health` |
| Stale API/Vite logs | `canvas/.dev-stack/logs/api.log`, `vite.log` |

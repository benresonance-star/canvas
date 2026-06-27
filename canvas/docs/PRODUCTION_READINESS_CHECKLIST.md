# Production Readiness Checklist

Use this before running Canvas outside the local development stack.

## Configuration

- Set `DATABASE_URL` to a managed Postgres instance with backups enabled.
- Set `AGENT_SECRETS_KEY` to a stable 32+ character secret before storing agent credentials.
- Keep `PORT` and `VITE_API_PROXY_TARGET` aligned for the deployed API/frontend pair.
- Review `JSON_BODY_LIMIT` if large project documents are expected; the default remains `52mb`.

## Data Safety

- Run `npm run audit:migrations` before deployment.
- Run `npm run db:migrate` once against the target database and rerun it to confirm idempotency.
- Confirm only one app version is migrating at a time; `server/migrate.js` also uses a Postgres advisory lock.
- Verify project create, switch, delete, folder scan, and conflict recovery in a staging database.

## Security

- Restrict CORS at the reverse proxy or server boundary before exposing the API publicly.
- Keep URL preview fetching limited to HTTP(S) URLs and continue rejecting private/internal targets when adding preview features.
- Treat markdown, code previews, link previews, and agent output as untrusted input; keep HTML generation escaped or sanitized.
- Avoid logging API keys, prompts with secrets, or raw generated file bytes.

## Operations

- Monitor API startup logs for limited database mode.
- Alert on repeated 409 project document conflicts, migration failures, and failed agent credential decrypts.
- Keep Docker/Postgres/Ollama logs separate from app logs in production.
- Re-run `npm run lint`, `npm run build`, `npm run test:sync`, and `npm run test:features` before release.

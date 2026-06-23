import { runMigrations } from './migrate.js';
import { claimDueLiveArtifacts, scheduleNextLiveRun } from './repositories/live-artifacts.js';
import { runLiveArtifact } from './services/liveArtifactRunner.js';

const POLL_MS = Number(process.env.LIVE_WORKER_POLL_MS) || 60_000;
let stopping = false;

async function tick() {
  const ids = await claimDueLiveArtifacts();
  for (const id of ids) {
    try {
      await runLiveArtifact(id, { triggerType: 'scheduled' });
    } catch (error) {
      console.error(`[live-worker] ${id}:`, error.message);
    } finally {
      await scheduleNextLiveRun(id).catch((error) => {
        console.error(`[live-worker] schedule ${id}:`, error.message);
      });
    }
  }
}

async function main() {
  await runMigrations();
  while (!stopping) {
    await tick().catch((error) => console.error('[live-worker]', error.message));
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
main().catch((error) => { console.error(error); process.exitCode = 1; });

/**
 * Stop API/Vite processes started by dev-stack.mjs.
 */
import { existsSync, readFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isListening, loadDevStackConfig, stopProcessOnPort } from './dev-stack-ports.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STACK_DIR = join(resolve(__dirname, '..'), '.dev-stack');
const CONFIG = loadDevStackConfig();

function log(msg) {
  console.log(`[dev-stack] ${msg}`);
}

function killPid(pid) {
  if (!pid || Number.isNaN(pid)) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'inherit',
      shell: true,
    });
  } else {
    spawnSync('kill', ['-TERM', String(pid)], { stdio: 'inherit', shell: true });
  }
}

for (const name of ['api', 'vite']) {
  const pidPath = join(STACK_DIR, `${name}.pid`);
  if (!existsSync(pidPath)) continue;
  const pid = Number.parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
  log(`stopping ${name} (pid ${pid})`);
  killPid(pid);
}

if (existsSync(STACK_DIR)) {
  rmSync(STACK_DIR, { recursive: true, force: true });
}

for (const [name, port] of [
  ['API', CONFIG.api.port],
  ['Vite', CONFIG.vite.port],
]) {
  if (isListening(port)) {
    log(`port ${port} still in use — stopping ${name} listener`);
    stopProcessOnPort(port);
  }
}

log('stopped API/Vite (Postgres + Ollama still running; docker stop canvas-postgres canvas-ollama to stop those too)');

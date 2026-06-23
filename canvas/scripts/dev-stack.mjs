/**
 * One-command local dev stack: Postgres → migrate → Ollama → API + Vite.
 *
 * Usage:
 *   npm run dev:stack
 *   node scripts/dev-stack.mjs --infra-only     # Docker + migrate only
 *   node scripts/dev-stack.mjs --no-docker-boot # skip Docker Desktop launch (used by restart)
 */
import { spawn, spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isListening, stopProcessOnPort } from './dev-stack-ports.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CANVAS_ROOT = resolve(__dirname, '..');
const STACK_DIR = join(CANVAS_ROOT, '.dev-stack');
const CONFIG = JSON.parse(
  readFileSync(join(CANVAS_ROOT, 'dev-stack.config.json'), 'utf8'),
);

const args = new Set(process.argv.slice(2));
const infraOnly = args.has('--infra-only');
const skipDockerBoot = args.has('--no-docker-boot');

function log(step, detail = '') {
  console.log(`[dev-stack] ${step}${detail ? `: ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function loadDotEnv() {
  const envPath = join(CANVAS_ROOT, '.env');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function run(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: opts.cwd ?? CANVAS_ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...loadDotEnv(), ...opts.env },
  });
  if (result.status !== 0 && !opts.allowFail) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function dockerOutput(cmdArgs) {
  const result = spawnSync('docker', cmdArgs, {
    cwd: CANVAS_ROOT,
    encoding: 'utf8',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `docker ${cmdArgs.join(' ')} failed`);
  }
  return (result.stdout ?? '').trim();
}

function isDockerReady() {
  const result = spawnSync('docker', ['info'], {
    cwd: CANVAS_ROOT,
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function dockerDesktopPaths() {
  if (process.platform === 'win32') {
    const roots = [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    const candidates = [];
    for (const root of roots) {
      candidates.push(join(root, 'Docker', 'Docker', 'Docker Desktop.exe'));
    }
    return candidates;
  }
  if (process.platform === 'darwin') {
    return ['/Applications/Docker.app'];
  }
  return [
    '/usr/local/bin/docker-desktop',
    '/opt/docker-desktop/bin/docker-desktop',
  ];
}

function startDockerDesktop() {
  if (process.platform === 'darwin') {
    const appPath = '/Applications/Docker.app';
    if (!existsSync(appPath)) return false;
    spawn('open', ['-a', 'Docker'], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }

  for (const exePath of dockerDesktopPaths()) {
    if (!existsSync(exePath)) continue;
    spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  return false;
}

async function ensureDockerReady() {
  if (skipDockerBoot) return;
  if (isDockerReady()) {
    log('Docker ready');
    return;
  }
  log('Docker not running — starting Docker Desktop');
  if (!startDockerDesktop()) {
    throw new Error(
      'Could not find Docker Desktop. Install it or start Docker manually, then run start canvas again.',
    );
  }
  log('waiting for Docker Desktop (this can take 1–2 minutes)');
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (isDockerReady()) {
      log('Docker ready');
      return;
    }
    await sleep(2000);
  }
  throw new Error(
    'Docker Desktop did not become ready in time. Open it manually and run start canvas again.',
  );
}

async function waitForPostgres(containerName) {
  log('waiting for Postgres');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const status = dockerOutput([
        'inspect',
        '-f',
        '{{.State.Health.Status}}',
        containerName,
      ]);
      if (status === 'healthy') {
        log('Postgres healthy');
        return;
      }
    } catch {
      // container may not exist yet
    }
    await sleep(2000);
  }
  throw new Error(`Postgres container "${containerName}" did not become healthy`);
}

async function waitForHttp(url, label, attempts = 45) {
  log(`waiting for ${label}`, url);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (res.ok || res.status < 500) {
        log(`${label} ready`);
        return;
      }
    } catch {
      // retry
    }
    await sleep(2000);
  }
  throw new Error(`${label} not reachable at ${url}`);
}

function containerRunning(name) {
  try {
    return Boolean(dockerOutput(['ps', '-q', '-f', `name=^${name}$`]));
  } catch {
    return false;
  }
}

function containerExists(name) {
  try {
    return Boolean(dockerOutput(['ps', '-aq', '-f', `name=^${name}$`]));
  } catch {
    return false;
  }
}

function containerPublishingPort(port) {
  try {
    return dockerOutput(['ps', '--filter', `publish=${port}`, '--format', '{{.Names}}']);
  } catch {
    return '';
  }
}

function containerHasOllamaVolume(containerName, volumeName) {
  try {
    const mounts = dockerOutput(['inspect', '-f', '{{json .Mounts}}', containerName]);
    const parsed = JSON.parse(mounts);
    return Array.isArray(parsed) && parsed.some(
      (mount) => mount.Destination === '/root/.ollama' && mount.Name === volumeName,
    );
  } catch {
    return false;
  }
}

function createOllamaContainer() {
  const { containerName, port, image, volumeName } = CONFIG.ollama;
  run('docker', [
    'run',
    '-d',
    '--name',
    containerName,
    '-p',
    `${port}:11434`,
    '-v',
    `${volumeName}:/root/.ollama`,
    image,
  ]);
}

function recreateOllamaWithVolume() {
  const { containerName, volumeName } = CONFIG.ollama;
  log('recreating Ollama with persistent volume', volumeName);
  run('docker', ['rm', '-f', containerName], { allowFail: true });
  createOllamaContainer();
}

async function ensureOllama() {
  const {
    containerName,
    volumeName = 'ollama',
    legacyContainerName = 'ollama',
  } = CONFIG.ollama;
  const activeOnPort = containerPublishingPort(CONFIG.ollama.port);

  if (activeOnPort === containerName) {
    if (!containerHasOllamaVolume(containerName, volumeName)) {
      recreateOllamaWithVolume();
    } else {
      log('Ollama already running', containerName);
    }
  } else if (activeOnPort === legacyContainerName) {
    log('using legacy Ollama container', legacyContainerName);
  } else if (containerExists(containerName)) {
    if (!containerHasOllamaVolume(containerName, volumeName)) {
      recreateOllamaWithVolume();
    } else {
      log('starting Ollama container', containerName);
      run('docker', ['start', containerName]);
    }
  } else if (
    legacyContainerName
    && legacyContainerName !== containerName
    && containerExists(legacyContainerName)
  ) {
    log('starting legacy Ollama container', legacyContainerName);
    run('docker', ['start', legacyContainerName]);
  } else {
    log('creating Ollama container', containerName);
    createOllamaContainer();
  }
  await waitForHttp(`${CONFIG.ollama.baseUrl}/api/tags`, 'Ollama');
}

async function isServiceUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function apiHasOllamaPullRoute() {
  try {
    const res = await fetch(`${CONFIG.api.url}/agent/ollama/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectorId: 'ollama-gemma-12b' }),
      signal: AbortSignal.timeout(3000),
    });
    return res.status !== 404;
  } catch {
    return false;
  }
}

function startBackground(name, command, cmdArgs, env = {}) {
  mkdirSync(join(STACK_DIR, 'logs'), { recursive: true });
  const logPath = join(STACK_DIR, 'logs', `${name}.log`);
  const logFd = openSync(logPath, 'a');
  const child = spawn(command, cmdArgs, {
    cwd: CANVAS_ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    shell: true,
    env: { ...process.env, ...loadDotEnv(), ...env },
  });
  child.unref();
  writeFileSync(join(STACK_DIR, `${name}.pid`), String(child.pid));
  log(`${name} started`, `pid ${child.pid} → ${logPath}`);
}

async function main() {
  log('starting Canvas dev stack');

  await ensureDockerReady();

  const composeFile = resolve(CANVAS_ROOT, CONFIG.postgres.composeFile);
  run('docker', ['compose', '-f', composeFile, 'up', '-d'], { cwd: CANVAS_ROOT });

  await waitForPostgres(CONFIG.postgres.containerName);

  const databaseUrl =
    loadDotEnv().DATABASE_URL ?? CONFIG.postgres.databaseUrl;
  run('npm', ['run', 'db:migrate'], { env: { DATABASE_URL: databaseUrl } });

  await ensureOllama();

  if (infraOnly) {
    log('infra ready (--infra-only); start API/Vite manually');
    return;
  }

  const apiHealthUp = await isServiceUp(`${CONFIG.api.url}/health`);
  const apiPullRouteReady = apiHealthUp && await apiHasOllamaPullRoute();
  if (!isListening(CONFIG.api.port) || !apiHealthUp || !apiPullRouteReady) {
    if (apiHealthUp && !apiPullRouteReady) {
      log('stale API detected — restarting');
      stopProcessOnPort(CONFIG.api.port);
      await sleep(1000);
    }
    startBackground('api', 'npm', ['run', 'server'], {
      DATABASE_URL: databaseUrl,
      PORT: String(CONFIG.api.port),
      VITE_API_PROXY_TARGET: CONFIG.api.url,
    });
  } else {
    log('API already running', CONFIG.api.url);
  }

  if (!isListening(CONFIG.vite.port) || !(await isServiceUp(CONFIG.vite.url))) {
    startBackground('vite', 'npm', ['run', 'dev', '--', '--port', String(CONFIG.vite.port), '--strictPort'], {
      VITE_API_PROXY_TARGET: CONFIG.api.url,
    });
  } else {
    log('Vite already running', CONFIG.vite.url);
  }

  await waitForHttp(`${CONFIG.api.url}/health`, 'API');
  await waitForHttp(CONFIG.vite.url, 'Vite');

  console.log('');
  console.log('Canvas dev stack is running:');
  console.log(`  App:      ${CONFIG.vite.url}`);
  console.log(`  API:      ${CONFIG.api.url}`);
  console.log(`  Ollama:   ${CONFIG.ollama.baseUrl}`);
  console.log(`  Postgres: ${databaseUrl}`);
  console.log('');
  console.log('Stop: npm run dev:stack:stop  (or say "stop canvas")');
  console.log('Restart: npm run dev:stack:restart  (or say "restart canvas")');
  console.log('Logs: canvas/.dev-stack/logs/');
}

main().catch((err) => {
  console.error(`[dev-stack] ${err.message}`);
  process.exit(1);
});
